/**
 * app.js - Trang chu: chat, giong noi (iOS-friendly), dem nguoc thuoc, nhac nho
 */

import {
  requireAuth, fetchMedications, fetchContacts,
  describeMedicationStatus, findContact, getDueMedications,
  logMedicationTaken, getMedicationScheduleInfo,
  fetchTodayMedicationLogs, buildTakenTodaySet,
} from "./supabase-client.js";
import { onAuthReady, logout, handleAuthCallback } from "./auth.js";

let session = null;
let medications = [];
let contacts = [];
const firedReminders = new Set();
/** medication_id da xac nhan uong hom nay — dong bo tu Supabase medication_logs */
let takenTodayIds = new Set();

// Dem nguoc: luu secondsUntil de tick moi giay
let countdownSeconds = 0;
let countdownState = "none";
let bellInterval = null;
let activeReminderMed = null;
const snoozedUntil = new Map(); // medId -> timestamp

// --- Trinh duyet & giong noi ---
const ua = navigator.userAgent;
const isIOS = /iPad|iPhone|iPod/.test(ua) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isSafariIOS = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
const isChromeIOS = /CriOS/.test(ua);
/** PWA tu man hinh chinh — Apple khong cho Web Speech hoat dong o che do nay */
const isStandalonePWA =
  window.navigator.standalone === true ||
  window.matchMedia("(display-mode: standalone)").matches ||
  window.matchMedia("(display-mode: fullscreen)").matches;
/** Apple chi cho Web Speech tren Safari tab — Chrome/PWA phai ghi am + Whisper */
const forceRecordSTT =
  isChromeIOS || (isIOS && !isSafariIOS) || (isIOS && isStandalonePWA);

let recognition = null;
let isListening = false;
let mediaRecorder = null;
let recordStream = null;
let recordChunks = [];

function initSpeech() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.continuous = false; // bat buoc cho iOS Safari
  recognition.maxAlternatives = 1;
  return recognition;
}

function formatCountdownCompact(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) return `${hrs}h ${String(mins).padStart(2, "0")}m`;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function pickRecorderMime() {
  if (!window.MediaRecorder) return "";
  for (const t of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/aac"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

async function transcribeRecording(blob) {
  const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("aac") ? "aac" : "webm";
  const form = new FormData();
  form.append("audio", blob, `recording.${ext}`);
  setStatus("Understanding...");
  const res = await fetch("/api/stt", { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "STT failed");
  }
  return res.json();
}

function formatLocalTime() {
  return new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatLocalDate() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** iOS PWA: click doi khi khong phan hoi — dung touchend */
function bindTap(el, handler) {
  if (!el) return;
  let handled = false;
  el.addEventListener("touchend", (e) => {
    handled = true;
    e.preventDefault();
    handler(e);
    setTimeout(() => { handled = false; }, 400);
  }, { passive: false });
  el.addEventListener("click", (e) => {
    if (handled) return;
    handler(e);
  });
}

function speak(text) {
  if (!text || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.85;
  window.speechSynthesis.speak(u);
}

/** iOS PWA can kich hoat speechSynthesis bang cu chi nguoi dung */
function unlockSpeechOnIOS() {
  if (!isIOS || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.getVoices();
  } catch { /* ignore */ }
}

/** Phat am thanh chuong nhac thuoc (Web Audio API) */
function playBellSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [[880, 0, 0.25], [880, 0.35, 0.25], [660, 0.7, 0.35]].forEach(([freq, delay, dur]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.35, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + dur);
      osc.start(now + delay);
      osc.stop(now + delay + dur + 0.05);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch { /* trinh duyet khong ho tro */ }
}

function startBellLoop() {
  stopBellLoop();
  playBellSound();
  bellInterval = setInterval(playBellSound, 4000);
}

function stopBellLoop() {
  if (bellInterval) {
    clearInterval(bellInterval);
    bellInterval = null;
  }
}

// --- Chat UI ---
function appendBubble(role, text) {
  const area = document.getElementById("chat-area");
  const div = document.createElement("div");
  div.className = role === "user" ? "bubble-user" : "bubble-assistant";
  div.innerHTML = `<div class="bubble-label">${role === "user" ? "You" : "Assistant"}</div>${escapeHtml(text)}`;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

/** App web co the mo bang trinh duyet */
const WEB_APPS = {
  youtube: "https://www.youtube.com",
  facebook: "https://www.facebook.com",
  gmail: "https://mail.google.com",
  maps: "https://maps.google.com",
  weather: "https://weather.com",
  news: "https://news.google.com",
};

/**
 * Mo link ngoai — tren dien thoai window.open bi chan sau goi API async.
 * Dung location.href (cung tab) hoac nut bam trong chat.
 */
function openExternalUrl(url) {
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobile || isStandalonePWA) {
    window.location.assign(url);
    return;
  }
  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (!popup) window.location.assign(url);
}

function appendOpenLinkBubble(text, url, linkLabel) {
  const area = document.getElementById("chat-area");
  const div = document.createElement("div");
  div.className = "bubble-assistant";
  div.innerHTML = `
    <div class="bubble-label">Assistant</div>
    ${escapeHtml(text)}
    <a href="${escapeHtml(url)}" class="open-link-btn" rel="noopener noreferrer">${escapeHtml(linkLabel)}</a>`;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

function setStatus(text, listening = false) {
  const el = document.getElementById("status-pill");
  if (!el) return;
  el.textContent = text;
  el.className = listening
    ? "status-pill status-pill-sm listening"
    : "status-pill status-pill-sm";
}

// --- Goi API NLP ---
async function callChatApi(text) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error("Chat API error");
  return res.json();
}

async function resolveReply(result) {
  const { intent, entity, reply } = result;
  if (intent === "time") return `The time is ${formatLocalTime()}.`;
  if (intent === "date") return `Today is ${formatLocalDate()}.`;
  if (reply) return reply;
  if (intent === "medication") {
    medications = await fetchMedications();
    return describeMedicationStatus(medications, takenTodayIds);
  }
  if (intent === "call") {
    contacts = await fetchContacts();
    const contact = findContact(contacts, entity);
    if (contact) {
      setTimeout(() => { window.location.href = `tel:${contact.phone.replace(/\s/g, "")}`; }, 1500);
      return `Calling ${contact.name} now at ${contact.phone}...`;
    }
    return `Calling ${entity} now... (Add them in Contacts first.)`;
  }
  if (intent === "open_app") {
    const key = (entity || "").toLowerCase();
    const url = WEB_APPS[key];
    if (url) {
      const msg = `Opening ${entity} for you.`;
      openExternalUrl(url);
      return { type: "open_app", text: msg, url, linkLabel: `Open ${entity}` };
    }
    return `Opening ${entity}... (App not available on phone browser.)`;
  }
  return reply || "I'm here for you.";
}

async function deliverAssistantReply(payload) {
  if (payload && typeof payload === "object" && payload.type === "open_app") {
    appendOpenLinkBubble(payload.text, payload.url, payload.linkLabel);
    speak(payload.text);
    return;
  }
  const text = typeof payload === "string" ? payload : String(payload ?? "");
  appendBubble("assistant", text);
  speak(text);
}

async function processUserMessage(text) {
  if (!text.trim()) return;
  appendBubble("user", text);
  setStatus("Thinking...");
  try {
    const result = await callChatApi(text);
    const reply = await resolveReply(result);
    await deliverAssistantReply(reply);
    setStatus("Ready");
  } catch {
    appendBubble("assistant", "Sorry, something went wrong. Please try again.");
    setStatus("Ready");
  }
}

// --- Mic: Web Speech (Safari) hoac ghi am + Whisper (Chrome iPhone) ---
function setupWebSpeechMic(btn, hint) {
  initSpeech();
  if (!recognition) return;

  hint.textContent = isIOS ? "Tap to Speak" : "Tap to Speak";

  recognition.onresult = (e) => {
    const text = e.results[0]?.[0]?.transcript;
    if (text) processUserMessage(text);
  };

  recognition.onerror = (e) => {
    isListening = false;
    btn.classList.remove("listening");
    setStatus("Ready");
    if (e.error !== "aborted" && e.error !== "no-speech") {
      speak("Sorry, I didn't hear you. Please tap again or type your message.");
    }
  };

  recognition.onend = () => {
    isListening = false;
    btn.classList.remove("listening");
    setStatus("Ready");
  };

  bindTap(btn, () => {
    unlockSpeechOnIOS();
    if (!recognition) return;

    if (isListening) {
      try { recognition.stop(); } catch { /* ignore */ }
      isListening = false;
      btn.classList.remove("listening");
      setStatus("Ready");
      return;
    }

    try {
      recognition.start();
      isListening = true;
      btn.classList.add("listening");
      setStatus("Listening...", true);
      speak("I'm listening.");
    } catch {
      try {
        recognition.stop();
        setTimeout(() => {
          try {
            recognition.start();
            isListening = true;
            btn.classList.add("listening");
            setStatus("Listening...", true);
          } catch { /* ignore */ }
        }, 300);
      } catch { /* ignore */ }
    }
  });
}

let recordAutoStopTimer = null;

const RECORD_MAX_MS = 12000;

function stopActiveRecording(btn) {
  try {
    if (mediaRecorder?.state === "recording") mediaRecorder.stop();
  } catch { /* ignore */ }
  if (recordAutoStopTimer) {
    clearTimeout(recordAutoStopTimer);
    recordAutoStopTimer = null;
  }
}

function setupRecordMic(btn, hint, { singleTap = false } = {}) {
  hint.textContent = singleTap ? "Tap once and speak" : "Tap mic · speak · tap again";
  let recording = false;

  const finishStart = () => {
    recordChunks = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size) recordChunks.push(e.data);
    };
    mediaRecorder.onstop = async () => {
      recordStream?.getTracks().forEach((t) => t.stop());
      recordStream = null;
      recording = false;
      isListening = false;
      btn.classList.remove("listening");
      if (recordAutoStopTimer) {
        clearTimeout(recordAutoStopTimer);
        recordAutoStopTimer = null;
      }
      if (!recordChunks.length) {
        setStatus("Ready");
        return;
      }
      const blob = new Blob(recordChunks, {
        type: mediaRecorder.mimeType || recordChunks[0]?.type || "audio/mp4",
      });
      try {
        const data = await transcribeRecording(blob);
        if (data.text) processUserMessage(data.text);
        else speak("Sorry, I didn't hear you. Please try again.");
      } catch {
        speak("Sorry, voice recognition failed. Please type your message.");
      }
      setStatus("Ready");
    };
    // timeslice bat buoc tren iOS de thu du lieu am thanh
    mediaRecorder.start(250);
    recording = true;
    isListening = true;
    btn.classList.add("listening");
    setStatus("Listening...", true);
    if (singleTap) {
      recordAutoStopTimer = setTimeout(() => stopActiveRecording(btn), RECORD_MAX_MS);
    }
  };

  const onMicTap = async () => {
    unlockSpeechOnIOS();
    window.speechSynthesis?.cancel();

    if (recording) {
      stopActiveRecording(btn);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      speak("Voice is not available here. Please type your message.");
      return;
    }

    try {
      recordStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const mime = pickRecorderMime();
      mediaRecorder = mime
        ? new MediaRecorder(recordStream, { mimeType: mime })
        : new MediaRecorder(recordStream);
      finishStart();
    } catch {
      speak("Please allow microphone access. Check Settings → Safari → Microphone.");
      setStatus("Ready");
    }
  };

  bindTap(btn, onMicTap);
}

function setupMicButton() {
  const btn = document.getElementById("speak-btn");
  const hint = document.getElementById("speak-hint");
  if (!btn) return;

  const hasWebSpeech = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const hasRecord = !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

  if (hasWebSpeech && !forceRecordSTT) {
    setupWebSpeechMic(btn, hint);
    return;
  }
  if (hasRecord) {
    setupRecordMic(btn, hint, { singleTap: forceRecordSTT });
    return;
  }

  hint.textContent = "Voice not available — please type";
  btn.style.opacity = "0.45";
  btn.disabled = true;
}

function setupCollapsiblePanel() {
  const btn = document.getElementById("toggle-actions-btn");
  const panel = document.getElementById("collapsible-actions");
  const label = document.getElementById("toggle-actions-label");
  const icon = document.getElementById("toggle-actions-icon");
  if (!btn || !panel) return;

  const setCollapsed = (collapsed) => {
    panel.classList.toggle("collapsed", collapsed);
    localStorage.setItem("actionsCollapsed", collapsed ? "true" : "false");
    if (label) label.textContent = collapsed ? "Show menu" : "Hide menu";
    if (icon) icon.textContent = collapsed ? "\u25B2" : "\u25BC";
    btn.setAttribute("aria-expanded", String(!collapsed));
  };

  setCollapsed(localStorage.getItem("actionsCollapsed") === "true");
  btn.addEventListener("click", () => {
    setCollapsed(!panel.classList.contains("collapsed"));
  });
}

function setupBrowserBanner() {
  const banner = document.getElementById("browser-banner");
  const textEl = document.getElementById("browser-banner-text");
  const copyBtn = document.getElementById("copy-url-btn");
  if (!banner || !textEl) return;

  const hasRecord = !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

  if (isIOS && isStandalonePWA && hasRecord) {
    textEl.textContent =
      "Tap mic once and speak — same as Safari. Allow microphone when asked.";
    banner.classList.remove("hidden");
  } else if (isIOS && isStandalonePWA && !hasRecord) {
    textEl.innerHTML =
      "Voice may not work in the home screen app. Open this page in <strong>Safari</strong> instead.";
    copyBtn?.classList.remove("hidden");
    banner.classList.remove("hidden");
  } else if (isChromeIOS && hasRecord) {
    textEl.textContent =
      "Chrome on iPhone: tap mic, speak, then tap again. Safari is faster for voice.";
    banner.classList.remove("hidden");
  } else if (isIOS && !isSafariIOS && !hasRecord) {
    textEl.innerHTML =
      "Voice needs <strong>Safari</strong> on iPhone. Copy link and open in Safari, or type below.";
    copyBtn?.classList.remove("hidden");
    banner.classList.remove("hidden");
  } else {
    return;
  }

  copyBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      copyBtn.textContent = "Copied!";
      setTimeout(() => { copyBtn.textContent = "Copy Safari link"; }, 2500);
    } catch {
      copyBtn.textContent = "Copy failed";
    }
  });
}

// --- Dem nguoc thuoc (dong nho tren header) ---
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function markMedicationHandled(medId) {
  takenTodayIds.add(medId);
  firedReminders.add(`${todayKey()}|${medId}`);
  snoozedUntil.delete(medId);
}

function getPendingDueMedications() {
  const nowMs = Date.now();
  return getDueMedications(medications, 30, takenTodayIds).filter((m) => {
    const snoozeEnd = snoozedUntil.get(m.id);
    return !snoozeEnd || nowMs >= snoozeEnd;
  });
}

async function refreshTakenToday() {
  const logs = await fetchTodayMedicationLogs();
  takenTodayIds = buildTakenTodaySet(logs);
}

function renderCountdownCard() {
  const info = getMedicationScheduleInfo(medications, takenTodayIds);
  countdownState = info.state;
  countdownSeconds = info.secondsUntil ?? 0;

  const card = document.getElementById("med-countdown-card");
  const label = document.getElementById("countdown-label");
  const timer = document.getElementById("countdown-timer");
  const sub = document.getElementById("countdown-sub");
  const actions = document.getElementById("countdown-actions");

  if (!card) return;

  card.classList.remove("due", "waiting", "none");

  if (info.state === "due") {
    card.classList.add("due");
    label.textContent = "Take now";
    timer.textContent = "NOW";
    sub.textContent = info.med
      ? `${info.med.name}${info.med.dose ? ` · ${info.med.dose}` : ""}`
      : "";
    actions?.classList.remove("hidden");
  } else if (info.state === "waiting") {
    card.classList.add("waiting");
    label.textContent = "Next medicine";
    timer.textContent = formatCountdownCompact(countdownSeconds);
    sub.textContent = info.med
      ? `${info.med.name} · ${info.med.time}${info.med.dose ? ` · ${info.med.dose}` : ""}`
      : "";
    actions?.classList.add("hidden");
  } else if (info.state === "done") {
    card.classList.add("none");
    label.textContent = "All done today";
    timer.textContent = "Done";
    sub.textContent = "Great job taking your medicine!";
    actions?.classList.add("hidden");
  } else {
    card.classList.add("none");
    label.textContent = "No medicines today";
    timer.textContent = "--:--";
    sub.textContent = "Add in Meds tab";
    actions?.classList.add("hidden");
  }
}

function tickCountdown() {
  if (countdownState === "waiting" && countdownSeconds > 0) {
    countdownSeconds -= 1;
    const el = document.getElementById("countdown-timer");
    if (el) el.textContent = formatCountdownCompact(countdownSeconds);
    if (countdownSeconds <= 0) renderCountdownCard();
  } else if (countdownState !== "due") {
    renderCountdownCard();
  }
}

async function refreshMedications() {
  medications = await fetchMedications();
  await refreshTakenToday();
  renderCountdownCard();
}

async function confirmMedicationTaken(med) {
  if (!med || !session) return;
  if (takenTodayIds.has(med.id)) {
    hideReminderModal();
    renderCountdownCard();
    return;
  }

  await logMedicationTaken(med.id, session.user.id);
  markMedicationHandled(med.id);

  stopBellLoop();
  hideReminderModal();

  speak("Wonderful! I recorded that you took your medicine. Great job!");
  appendBubble("assistant", `Confirmed: you took ${med.name}. Well done!`);

  await refreshMedications();

  // Thuoc tiep theo trong cung cua so gio — nhac sau khi da dong modal hien tai
  const nextDue = getPendingDueMedications().find((m) => m.id !== med.id);
  if (nextDue) {
    setTimeout(() => showReminderModal(nextDue), 800);
  }
}

function showReminderModal(med) {
  if (!med || takenTodayIds.has(med.id)) return;

  const overlay = document.getElementById("reminder-overlay");
  if (overlay && !overlay.classList.contains("hidden") && activeReminderMed?.id === med.id) {
    return;
  }
  if (overlay && !overlay.classList.contains("hidden") && activeReminderMed) {
    return;
  }

  activeReminderMed = med;
  const dose = med.dose ? ` (${med.dose})` : "";
  const msg = `It is time to take your medicine: ${med.name}${dose}. Please take it now, then tap confirm below.`;

  const textEl = document.getElementById("reminder-modal-text");
  if (textEl) textEl.textContent = msg;
  overlay?.classList.remove("hidden");

  appendBubble("assistant", msg);
  speak(msg);
  startBellLoop();
  renderCountdownCard();

  // Rung nhe tren dien thoai (neu ho tro)
  if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 500]);
}

function hideReminderModal() {
  document.getElementById("reminder-overlay")?.classList.add("hidden");
  activeReminderMed = null;
}

function setupReminderModal() {
  document.getElementById("reminder-confirm-btn")?.addEventListener("click", async () => {
    if (activeReminderMed) await confirmMedicationTaken(activeReminderMed);
  });

  document.getElementById("reminder-snooze-btn")?.addEventListener("click", () => {
    if (!activeReminderMed) return;
    snoozedUntil.set(activeReminderMed.id, Date.now() + 5 * 60 * 1000);
    stopBellLoop();
    hideReminderModal();
    speak("Okay, I will remind you again in five minutes.");
  });

  document.getElementById("card-took-btn")?.addEventListener("click", async () => {
    const due = getPendingDueMedications();
    if (due.length > 0) {
      await confirmMedicationTaken(due[0]);
      return;
    }
    if (activeReminderMed && !takenTodayIds.has(activeReminderMed.id)) {
      await confirmMedicationTaken(activeReminderMed);
    }
  });
}

// --- Quick actions ---
function setupQuickActions() {
  document.getElementById("quick-meds")?.addEventListener("click", async () => {
    await refreshMedications();
    const reply = describeMedicationStatus(medications, takenTodayIds);
    appendBubble("assistant", reply);
    speak(reply);
  });

  document.getElementById("quick-news")?.addEventListener("click", async () => {
    appendBubble("user", "Tell me today's news");
    setStatus("Loading news...");
    try {
      const res = await fetch("/api/news");
      const data = await res.json();
      let reply = data.summary || "No news available right now.";
      if (data.headlines?.length) {
        reply += `\n\n(${data.headlines.length} headlines from BBC News.)`;
      }
      appendBubble("assistant", reply);
      speak(data.summary || reply);
    } catch {
      appendBubble("assistant", "Sorry, I couldn't load the news. Please try again.");
    }
    setStatus("Ready");
  });

  document.getElementById("quick-greeting")?.addEventListener("click", async () => {
    setStatus("Thinking...");
    try {
      const res = await fetch("/api/greeting");
      const data = await res.json();
      await refreshMedications();
      const medInfo = describeMedicationStatus(medications, takenTodayIds);
      const reply = `${data.greeting} ${medInfo}`;
      appendBubble("assistant", reply);
      speak(reply);
    } catch {
      appendBubble("assistant", "Good day! I hope you are feeling well today.");
    }
    setStatus("Ready");
  });

  document.getElementById("quick-tip")?.addEventListener("click", async () => {
    try {
      const res = await fetch("/api/health-tip");
      const data = await res.json();
      appendBubble("assistant", data.tip);
      speak(data.tip);
    } catch {
      appendBubble("assistant", "Remember to drink water and take gentle care of yourself today.");
    }
  });

  document.getElementById("quick-family")?.addEventListener("click", async () => {
    contacts = await fetchContacts();
    const family = findContact(contacts, "daughter") ||
      findContact(contacts, "son") || contacts[0];
    if (family) {
      const reply = `Calling ${family.name} now...`;
      appendBubble("assistant", reply);
      speak(reply);
      setTimeout(() => { window.location.href = `tel:${family.phone.replace(/\s/g, "")}`; }, 1200);
    } else {
      window.location.href = "/contacts";
    }
  });

  document.getElementById("quick-lonely")?.addEventListener("click", () => {
    processUserMessage("I feel a bit lonely. Can we talk?");
  });
}

function setupTextInput() {
  const input = document.getElementById("text-input");
  const send = document.getElementById("send-btn");
  const submit = () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    processUserMessage(text);
  };
  send?.addEventListener("click", submit);
  input?.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
}

function updateClock() {
  const el = document.getElementById("clock");
  if (el) {
    el.textContent = new Date().toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit",
    });
  }
}

function showReminderToast(med) {
  showReminderModal(med);
}

async function checkReminders() {
  if (!session) return;
  try {
    await refreshMedications();
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const day = todayKey();
    const nowMs = Date.now();

    const overlay = document.getElementById("reminder-overlay");
    const modalOpen = overlay && !overlay.classList.contains("hidden");

    for (const med of medications) {
      if (takenTodayIds.has(med.id)) continue;

      const snoozeEnd = snoozedUntil.get(med.id);
      if (snoozeEnd && nowMs < snoozeEnd) continue;
      if (snoozeEnd && nowMs >= snoozeEnd) snoozedUntil.delete(med.id);

      if (med.time === hhmm) {
        const key = `${day}|${med.id}`;
        if (!firedReminders.has(key) && !modalOpen) {
          firedReminders.add(key);
          showReminderModal(med);
          return;
        }
      }
    }

    // Snooze het han -> nhac lai (neu chua uong)
    for (const [medId, endTime] of [...snoozedUntil.entries()]) {
      if (nowMs >= endTime && !takenTodayIds.has(medId) && !modalOpen) {
        snoozedUntil.delete(medId);
        const med = medications.find((m) => m.id === medId);
        if (med) showReminderModal(med);
        return;
      }
    }

    // Mo lai nhac neu trong cua so gio ma chua uong (khong lap lai khi modal dang mo)
    if (!modalOpen) {
      const due = getPendingDueMedications();
      if (due.length > 0) {
        const med = due[0];
        const key = `${day}|${med.id}`;
        if (!firedReminders.has(key)) {
          firedReminders.add(key);
          showReminderModal(med);
        }
      }
    }
  } catch (err) {
    console.warn("[Reminder]", err);
  }
}

function setupLogout() {
  document.getElementById("logout-btn")?.addEventListener("click", () => {
    if (confirm("Sign out?")) logout();
  });
}

async function init() {
  session = await handleAuthCallback();
  if (!session) session = await requireAuth();
  if (!session) return;

  await onAuthReady(session);
  medications = await fetchMedications();
  await refreshTakenToday();
  contacts = await fetchContacts();

  setupMicButton();
  setupCollapsiblePanel();
  setupBrowserBanner();
  setupQuickActions();
  setupTextInput();
  setupLogout();
  setupReminderModal();
  renderCountdownCard();

  setInterval(updateClock, 1000);
  setInterval(tickCountdown, 1000);
  setInterval(checkReminders, 30000);
  updateClock();
  checkReminders();

  appendBubble("assistant",
    "Hello! Tap the microphone to talk. When it's medicine time, you'll hear a bell — then confirm you took it.");
}

init();
