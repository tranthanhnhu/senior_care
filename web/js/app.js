/**
 * app.js - Trang chu: chat, giong noi Web Speech, xu ly intent, nhac thuoc
 */

import {
  requireAuth, fetchMedications, fetchContacts,
  describeMedicationStatus, findContact, getDueMedications, logMedicationTaken,
} from "./supabase-client.js";
import { onAuthReady, logout, getCurrentUserEmail, handleAuthCallback } from "./auth.js";

let session = null;
let medications = [];
let contacts = [];
const firedReminders = new Set();

// --- Web Speech API ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

function initSpeech() {
  if (!SpeechRecognition) return null;
  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  return recognition;
}

function speak(text) {
  if (!text || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.9;
  window.speechSynthesis.speak(u);
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

// --- Xu ly intent (frontend thuc thi voi Supabase) ---
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
    return `Calling ${entity} now... (Not in your contacts yet. Add them in Contacts.)`;
  }
  if (intent === "open_app") {
    const apps = {
      youtube: "https://www.youtube.com",
      facebook: "https://www.facebook.com",
      gmail: "https://mail.google.com",
      maps: "https://maps.google.com",
      weather: "https://weather.com",
    };
    const key = (entity || "").toLowerCase();
    if (apps[key]) {
      window.open(apps[key], "_blank");
      return `Opening ${entity} for you now.`;
    }
    return `Opening ${entity} now... (Simulation for this app.)`;
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
    const err = "Sorry, something went wrong. Please try again.";
    appendBubble("assistant", err);
    setStatus("Ready");
  }
}

// --- Mic: hold to speak ---
function setupMicButton() {
  const btn = document.getElementById("speak-btn");
  if (!btn) return;

  if (!SpeechRecognition) {
    btn.title = "Voice not supported - please type your message";
    btn.style.opacity = "0.5";
    return;
  }
  initSpeech();

  const startListen = () => {
    if (!recognition) return;
    btn.classList.add("listening");
    setStatus("Listening...", true);
    recognition.start();
  };

  const stopListen = () => {
    btn.classList.remove("listening");
    try { recognition.stop(); } catch { /* ignore */ }
  };

  recognition.onresult = (e) => {
    const text = e.results[0][0].transcript;
    btn.classList.remove("listening");
    setStatus("Ready");
    processUserMessage(text);
  };

  recognition.onerror = () => {
    btn.classList.remove("listening");
    setStatus("Ready");
    speak("Sorry, I didn't hear you. Please try again or type your message.");
  };

  recognition.onend = () => btn.classList.remove("listening");

  btn.addEventListener("mousedown", startListen);
  btn.addEventListener("mouseup", stopListen);
  btn.addEventListener("mouseleave", stopListen);
  btn.addEventListener("touchstart", (e) => { e.preventDefault(); startListen(); });
  btn.addEventListener("touchend", (e) => { e.preventDefault(); stopListen(); });
}

// --- Quick actions ---
function setupQuickActions() {
  document.getElementById("quick-meds")?.addEventListener("click", async () => {
    medications = await fetchMedications();
    const reply = describeMedicationStatus(medications);
    appendBubble("assistant", reply);
    speak(reply);
  });

  document.getElementById("quick-time")?.addEventListener("click", () => {
    const now = new Date();
    const reply = `The time is ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.`;
    appendBubble("assistant", reply);
    speak(reply);
  });

  document.getElementById("quick-help")?.addEventListener("click", () => {
    const reply = "I can remind you to take medicine, tell you the time, call your family, and chat with you. Hold the green button to speak, or type below.";
    appendBubble("assistant", reply);
    speak(reply);
  });

  document.getElementById("quick-call")?.addEventListener("click", () => {
    window.location.href = "/contacts";
  });
}

// --- Text input ---
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
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
}

// --- Dong ho ---
function updateClock() {
  const el = document.getElementById("clock");
  if (el) {
    el.textContent = new Date().toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", weekday: "short",
    });
  }
  setTimeout(updateClock, 1000);
}

// --- Nhac uong thuoc (client-side, can tab dang mo) ---
function showReminderToast(med) {
  const existing = document.getElementById("reminder-toast");
  if (existing) existing.remove();

  const dose = med.dose ? ` (${med.dose})` : "";
  const msg = `It is time to take your medicine: ${med.name}${dose}.`;

  const toast = document.createElement("div");
  toast.id = "reminder-toast";
  toast.className = "toast";
  toast.innerHTML = `
    <div class="toast-title">Medication Reminder</div>
    <p>${escapeHtml(msg)}</p>
    <button id="toast-took-btn" class="btn-primary mt-3" style="margin-top:12px">I took it</button>
  `;
  document.body.appendChild(toast);
  appendBubble("assistant", msg);
  speak(msg);

  document.getElementById("toast-took-btn")?.addEventListener("click", async () => {
    await logMedicationTaken(med.id, session.user.id);
    toast.remove();
    speak("Great job! Medicine logged.");
  });
}

async function checkReminders() {
  if (!session) return;
  try {
    medications = await fetchMedications();
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const day = now.toISOString().slice(0, 10);

    for (const med of medications) {
      if (med.time === hhmm) {
        const key = `${day}|${med.id}`;
        if (!firedReminders.has(key)) {
          firedReminders.add(key);
          showReminderToast(med);
        }
      }
    }
  } catch (err) {
    console.warn("[Reminder]", err);
  }
}

function startReminderLoop() {
  checkReminders();
  setInterval(checkReminders, 30000);
}

// --- Bottom nav logout ---
function setupNav() {
  document.getElementById("nav-logout")?.addEventListener("click", (e) => {
    e.preventDefault();
    logout();
  });
}

// --- Khoi tao trang ---
async function init() {
  session = await handleAuthCallback();
  if (!session) session = await requireAuth();
  if (!session) return;

  await onAuthReady(session);
  medications = await fetchMedications();
  contacts = await fetchContacts();

  const email = await getCurrentUserEmail();
  const userEl = document.getElementById("user-email");
  if (userEl) userEl.textContent = email.split("@")[0];

  setupMicButton();
  setupQuickActions();
  setupTextInput();
  setupNav();
  updateClock();
  startReminderLoop();

  appendBubble("assistant",
    "Hello! I'm your care assistant. Hold the green button to speak, or type a message below.");
}

init();
