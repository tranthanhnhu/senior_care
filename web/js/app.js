/**
 * app.js - Trang chu: chat, giong noi (iOS-friendly), dem nguoc thuoc, nhac nho
 */

import {
  requireAuth, fetchMedications, fetchContacts,
  describeMedicationStatus, findContact, getDueMedications,
  logMedicationTaken, getMedicationScheduleInfo, formatCountdown,
} from "./supabase-client.js";
import { onAuthReady, logout, handleAuthCallback } from "./auth.js";

let session = null;
let medications = [];
let contacts = [];
const firedReminders = new Set();

// Dem nguoc: luu secondsUntil de tick moi giay
let countdownSeconds = 0;
let countdownState = "none";
let bellInterval = null;
let activeReminderMed = null;
const snoozedUntil = new Map(); // medId -> timestamp

// --- Web Speech API ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

let recognition = null;
let isListening = false;

function initSpeech() {
  if (!SpeechRecognition) return null;
  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.continuous = false; // bat buoc cho iOS Safari
  recognition.maxAlternatives = 1;
  return recognition;
}

function speak(text) {
  if (!text || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.85;
  window.speechSynthesis.speak(u);
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

function setStatus(text, listening = false) {
  const el = document.getElementById("status-pill");
  if (!el) return;
  el.textContent = text;
  el.className = listening ? "status-pill listening" : "status-pill";
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
  if (reply) return reply;
  if (intent === "medication") {
    medications = await fetchMedications();
    return describeMedicationStatus(medications);
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
    const apps = { youtube: "https://www.youtube.com", facebook: "https://www.facebook.com" };
    const key = (entity || "").toLowerCase();
    if (apps[key]) { window.open(apps[key], "_blank"); return `Opening ${entity} for you.`; }
    return `Opening ${entity}... (Simulation.)`;
  }
  return reply || "I'm here for you.";
}

async function processUserMessage(text) {
  if (!text.trim()) return;
  appendBubble("user", text);
  setStatus("Thinking...");
  try {
    const result = await callChatApi(text);
    const reply = await resolveReply(result);
    appendBubble("assistant", reply);
    speak(reply);
    setStatus("Ready");
  } catch {
    appendBubble("assistant", "Sorry, something went wrong. Please try again.");
    setStatus("Ready");
  }
}

// --- Mic: TAP de noi (hoat dong tren iPhone Safari) ---
function setupMicButton() {
  const btn = document.getElementById("speak-btn");
  const hint = document.getElementById("speak-hint");
  if (!btn) return;

  if (!SpeechRecognition) {
    hint.textContent = "Voice not available — please type your message";
    btn.style.opacity = "0.45";
    btn.disabled = true;
    return;
  }

  initSpeech();

  if (isIOS) {
    hint.textContent = "Tap to Speak (use Safari browser)";
  } else {
    hint.textContent = "Tap to Speak";
  }

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

  // iOS: chi dung click/tap — KHONG dung hold, KHONG preventDefault tren touch
  btn.addEventListener("click", () => {
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
      setStatus("Listening... tap again to stop", true);
      speak("I'm listening.");
    } catch {
      // Da chay roi — thu stop roi start lai
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

// --- Dem nguoc thuoc ---
function renderCountdownCard() {
  const info = getMedicationScheduleInfo(medications);
  countdownState = info.state;
  countdownSeconds = info.secondsUntil ?? 0;

  const card = document.getElementById("med-countdown-card");
  const label = document.getElementById("countdown-label");
  const timer = document.getElementById("countdown-timer");
  const sub = document.getElementById("countdown-sub");

  if (!card) return;

  card.classList.remove("due", "waiting", "none");

  if (info.state === "due") {
    card.classList.add("due");
    label.textContent = "Medicine time!";
    timer.textContent = "TAKE NOW";
    sub.textContent = info.med ? `${info.med.name}${info.med.dose ? ` · ${info.med.dose}` : ""}` : "";
    document.getElementById("countdown-actions")?.classList.remove("hidden");
  } else if (info.state === "waiting") {
    card.classList.add("waiting");
    label.textContent = "Next medicine in";
    timer.textContent = info.countdownText;
    sub.textContent = `${info.med.name} at ${info.med.time}${info.med.dose ? ` · ${info.med.dose}` : ""}`;
    document.getElementById("countdown-actions")?.classList.add("hidden");
  } else {
    card.classList.add("none");
    label.textContent = "No medicines today";
    timer.textContent = "--:--:--";
    sub.textContent = "Add medicines in the Meds tab";
    document.getElementById("countdown-actions")?.classList.add("hidden");
  }
}

function tickCountdown() {
  if (countdownState === "waiting" && countdownSeconds > 0) {
    countdownSeconds -= 1;
    const el = document.getElementById("countdown-timer");
    if (el) el.textContent = formatCountdown(countdownSeconds);
    if (countdownSeconds <= 0) renderCountdownCard();
  } else if (countdownState !== "due") {
    renderCountdownCard();
  }
}

async function refreshMedications() {
  medications = await fetchMedications();
  renderCountdownCard();
}

async function confirmMedicationTaken(med) {
  if (!med || !session) return;
  await logMedicationTaken(med.id, session.user.id);
  stopBellLoop();
  hideReminderModal();
  speak("Wonderful! I recorded that you took your medicine. Great job!");
  appendBubble("assistant", `Confirmed: you took ${med.name}. Well done!`);
  await refreshMedications();
}

function showReminderModal(med) {
  activeReminderMed = med;
  const dose = med.dose ? ` (${med.dose})` : "";
  const msg = `It is time to take your medicine: ${med.name}${dose}. Please take it now, then tap confirm below.`;

  const overlay = document.getElementById("reminder-overlay");
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
    const due = getDueMedications(medications);
    if (due.length > 0) {
      for (const med of due) await confirmMedicationTaken(med);
    } else if (activeReminderMed) {
      await confirmMedicationTaken(activeReminderMed);
    }
  });
}

// --- Quick actions ---
function setupQuickActions() {
  document.getElementById("quick-meds")?.addEventListener("click", async () => {
    await refreshMedications();
    const reply = describeMedicationStatus(medications);
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
      const medInfo = describeMedicationStatus(medications);
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
    const day = now.toISOString().slice(0, 10);
    const nowMs = Date.now();

    for (const med of medications) {
      // Snooze: bo qua den khi het han
      const snoozeEnd = snoozedUntil.get(med.id);
      if (snoozeEnd && nowMs < snoozeEnd) continue;
      if (snoozeEnd && nowMs >= snoozeEnd) snoozedUntil.delete(med.id);

      if (med.time === hhmm) {
        const key = `${day}|${med.id}`;
        if (!firedReminders.has(key)) {
          firedReminders.add(key);
          showReminderModal(med);
        }
      }
    }

    // Snooze het han -> nhac lai
    for (const [medId, endTime] of [...snoozedUntil.entries()]) {
      if (nowMs >= endTime) {
        snoozedUntil.delete(medId);
        const med = medications.find((m) => m.id === medId);
        if (med) showReminderModal(med);
      }
    }

    // Trong cua so "due" ma modal chua mo -> hien nhac
    const overlay = document.getElementById("reminder-overlay");
    const modalOpen = overlay && !overlay.classList.contains("hidden");
    if (!modalOpen) {
      const due = getDueMedications(medications).filter((m) => {
        const end = snoozedUntil.get(m.id);
        return !end || nowMs >= end;
      });
      if (due.length > 0) showReminderModal(due[0]);
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
  contacts = await fetchContacts();

  setupMicButton();
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
