/**
 * supabase-client.js - localStorage-based storage (khong can Supabase)
 */

const LOCAL_USER = { id: "local-user", email: "user@local" };
const LOCAL_SESSION = { user: LOCAL_USER };

const KEYS = {
  meds: "sc_medications",
  contacts: "sc_contacts",
  logs: "sc_logs",
};

function loadJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function nextId(items) {
  if (!items || items.length === 0) return 1;
  return Math.max(...items.map((i) => i.id || 0)) + 1;
}

export async function loadConfig() {
  return { supabaseUrl: "", supabaseAnonKey: "", appTitle: "Senior Care Assistant", openaiEnabled: true };
}

export async function getSupabase() {
  return null;
}

export async function requireAuth() {
  return LOCAL_SESSION;
}

const DEMO_MEDS = [
  { id: 1, name: "Blood Pressure Pill", time: "08:00", dose: "1 tablet", user_id: "local-user" },
  { id: 2, name: "Vitamin D", time: "12:30", dose: "1 capsule", user_id: "local-user" },
  { id: 3, name: "Heart Medicine", time: "20:00", dose: "1 tablet", user_id: "local-user" },
];

const DEMO_CONTACTS = [
  { id: 1, name: "daughter", phone: "+1 555 0101", user_id: "local-user" },
  { id: 2, name: "son", phone: "+1 555 0102", user_id: "local-user" },
  { id: 3, name: "doctor", phone: "+1 555 0199", user_id: "local-user" },
  { id: 4, name: "emergency", phone: "911", user_id: "local-user" },
  { id: 5, name: "neighbor", phone: "+1 555 0123", user_id: "local-user" },
];

export async function seedDemoDataIfEmpty() {
  if (!localStorage.getItem(KEYS.meds)) saveJSON(KEYS.meds, DEMO_MEDS);
  if (!localStorage.getItem(KEYS.contacts)) saveJSON(KEYS.contacts, DEMO_CONTACTS);
}

export async function fetchMedications() {
  return loadJSON(KEYS.meds, DEMO_MEDS);
}

export async function fetchContacts() {
  return loadJSON(KEYS.contacts, DEMO_CONTACTS);
}

export async function fetchTodayMedicationLogs() {
  const allLogs = loadJSON(KEYS.logs, []);
  const today = new Date().toDateString();
  return allLogs.filter((l) => new Date(l.taken_at).toDateString() === today);
}

export function buildTakenTodaySet(logs) {
  return new Set((logs || []).map((row) => String(row.medication_id)));
}

export async function logMedicationTaken(medicationId) {
  const allLogs = loadJSON(KEYS.logs, []);
  allLogs.push({ medication_id: String(medicationId), taken_at: new Date().toISOString() });
  saveJSON(KEYS.logs, allLogs);
}

export async function addMedication(name, time, dose) {
  const meds = loadJSON(KEYS.meds, []);
  meds.push({ id: nextId(meds), name, time, dose: dose || "", user_id: "local-user" });
  meds.sort((a, b) => a.time.localeCompare(b.time));
  saveJSON(KEYS.meds, meds);
}

export async function removeMedication(id) {
  const meds = loadJSON(KEYS.meds, []);
  saveJSON(KEYS.meds, meds.filter((m) => String(m.id) !== String(id)));
}

export async function addContact(name, phone) {
  const contacts = loadJSON(KEYS.contacts, []);
  contacts.push({ id: nextId(contacts), name: name.toLowerCase(), phone, user_id: "local-user" });
  contacts.sort((a, b) => a.name.localeCompare(b.name));
  saveJSON(KEYS.contacts, contacts);
}

export async function removeContact(id) {
  const contacts = loadJSON(KEYS.contacts, []);
  saveJSON(KEYS.contacts, contacts.filter((c) => String(c.id) !== String(id)));
}

export function getDueMedications(medications, windowMinutes = 30, takenIds = null) {
  const taken = takenIds instanceof Set ? takenIds : new Set();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return medications.filter((med) => {
    if (taken.has(String(med.id))) return false;
    const [h, m] = med.time.split(":").map(Number);
    const medMin = h * 60 + m;
    const diff = nowMin - medMin;
    return diff >= 0 && diff <= windowMinutes;
  });
}

export function describeMedicationStatus(medications, takenIds = null) {
  const taken = takenIds instanceof Set ? takenIds : new Set();
  const due = getDueMedications(medications, 30, taken);
  if (due.length > 0) {
    const names = due.map((m) => `${m.name}${m.dose ? ` (${m.dose})` : ""}`).join(", ");
    return `Yes, it is time to take your medicine: ${names}.`;
  }

  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const upcoming = medications
    .filter((m) => !taken.has(String(m.id)))
    .map((m) => {
      const [h, min] = m.time.split(":").map(Number);
      return { med: m, min: h * 60 + min };
    })
    .filter((x) => x.min > nowMin)
    .sort((a, b) => a.min - b.min);

  if (upcoming.length === 0) {
    const anyLeft = medications.some((m) => !taken.has(String(m.id)));
    if (!anyLeft && medications.length > 0) {
      return "You have taken all your medicine for today. Well done!";
    }
    return "You have no more medicine scheduled for today. Well done!";
  }
  const next = upcoming[0].med;
  return `Not right now. Your next medicine is ${next.name} at ${next.time}.`;
}

export function findContact(contacts, name) {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  return contacts.find((c) => c.name.toLowerCase() === key) || null;
}

export function getMedicationScheduleInfo(medications, takenIds = null) {
  const taken = takenIds instanceof Set ? takenIds : new Set();

  if (!medications || medications.length === 0) {
    return { state: "none", countdownText: "--:--", label: "No medicines scheduled", med: null };
  }

  const pending = medications.filter((m) => !taken.has(String(m.id)));
  if (pending.length === 0) {
    return {
      state: "done",
      med: null,
      secondsUntil: 0,
      countdownText: "Done",
      label: "All medicines taken today",
    };
  }

  const due = getDueMedications(pending, 30, taken);
  if (due.length > 0) {
    const m = due[0];
    return {
      state: "due",
      med: m,
      allDue: due,
      secondsUntil: 0,
      countdownText: "NOW",
      label: `Time to take: ${m.name}`,
    };
  }

  const now = new Date();
  const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

  let bestMed = null;
  let bestDiff = Infinity;

  for (const med of pending) {
    const [h, m] = med.time.split(":").map(Number);
    let targetSec = h * 3600 + m * 60;
    if (targetSec <= nowSec) targetSec += 24 * 3600;
    const diff = targetSec - nowSec;
    if (diff < bestDiff) {
      bestDiff = diff;
      bestMed = med;
    }
  }

  const hrs = Math.floor(bestDiff / 3600);
  const mins = Math.floor((bestDiff % 3600) / 60);
  const secs = bestDiff % 60;
  const countdownText = `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  return {
    state: "waiting",
    med: bestMed,
    secondsUntil: bestDiff,
    countdownText,
    label: `Next: ${bestMed.name} at ${bestMed.time}`,
  };
}

export function formatCountdown(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
