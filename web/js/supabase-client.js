/**
 * supabase-client.js - Khoi tao Supabase client tu /api/config
 */

let _supabase = null;
let _config = null;

/** Lay cau hinh public tu backend */
export async function loadConfig() {
  if (_config) return _config;
  const res = await fetch("/api/config");
  if (!res.ok) throw new Error("Could not load app config");
  _config = await res.json();
  return _config;
}

/** Tra ve Supabase client (khoi tao lazy) */
export async function getSupabase() {
  if (_supabase) return _supabase;
  const cfg = await loadConfig();
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env");
  }
  const { createClient } = window.supabase;
  _supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  return _supabase;
}

/** Kiem tra session, redirect ve login neu chua dang nhap */
export async function requireAuth() {
  const sb = await getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    window.location.href = "/login";
    return null;
  }
  return session;
}

/** Du lieu mau seed khi user moi chua co thuoc/danh ba */
const DEMO_MEDS = [
  { name: "Blood Pressure Pill", time: "08:00", dose: "1 tablet" },
  { name: "Vitamin D", time: "12:30", dose: "1 capsule" },
  { name: "Heart Medicine", time: "20:00", dose: "1 tablet" },
];

const DEMO_CONTACTS = [
  { name: "daughter", phone: "+1 555 0101" },
  { name: "son", phone: "+1 555 0102" },
  { name: "doctor", phone: "+1 555 0199" },
  { name: "emergency", phone: "911" },
  { name: "neighbor", phone: "+1 555 0123" },
];

/** Seed du lieu demo neu bang trong */
export async function seedDemoDataIfEmpty(userId) {
  const sb = await getSupabase();

  const { data: meds } = await sb.from("medications").select("id").limit(1);
  if (!meds || meds.length === 0) {
    await sb.from("medications").insert(
      DEMO_MEDS.map((m) => ({ ...m, user_id: userId }))
    );
  }

  const { data: contacts } = await sb.from("contacts").select("id").limit(1);
  if (!contacts || contacts.length === 0) {
    await sb.from("contacts").insert(
      DEMO_CONTACTS.map((c) => ({ ...c, user_id: userId }))
    );
  }
}

/** Lay danh sach thuoc */
export async function fetchMedications() {
  const sb = await getSupabase();
  const { data, error } = await sb.from("medications").select("*").order("time");
  if (error) throw error;
  return data || [];
}

/** Lay danh sach lien he */
export async function fetchContacts() {
  const sb = await getSupabase();
  const { data, error } = await sb.from("contacts").select("*").order("name");
  if (error) throw error;
  return data || [];
}

/** Kiem tra thuoc den gio (trong cua so 30 phut) */
export function getDueMedications(medications, windowMinutes = 30) {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return medications.filter((med) => {
    const [h, m] = med.time.split(":").map(Number);
    const medMin = h * 60 + m;
    const diff = nowMin - medMin;
    return diff >= 0 && diff <= windowMinutes;
  });
}

/** Tao cau tra loi ve thuoc */
export function describeMedicationStatus(medications) {
  const due = getDueMedications(medications);
  if (due.length > 0) {
    const names = due.map((m) => `${m.name}${m.dose ? ` (${m.dose})` : ""}`).join(", ");
    return `Yes, it is time to take your medicine: ${names}.`;
  }
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const upcoming = medications
    .map((m) => {
      const [h, min] = m.time.split(":").map(Number);
      return { med: m, min: h * 60 + min };
    })
    .filter((x) => x.min > nowMin)
    .sort((a, b) => a.min - b.min);
  if (upcoming.length === 0) {
    return "You have no more medicine scheduled for today. Well done!";
  }
  const next = upcoming[0].med;
  return `Not right now. Your next medicine is ${next.name} at ${next.time}.`;
}

/** Tim lien he theo ten (khong phan biet hoa thuong) */
export function findContact(contacts, name) {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  return contacts.find((c) => c.name.toLowerCase() === key) || null;
}

/** Ghi log da uong thuoc */
export async function logMedicationTaken(medicationId, userId) {
  const sb = await getSupabase();
  const { error } = await sb.from("medication_logs").insert({
    medication_id: medicationId,
    user_id: userId,
  });
  if (error) throw error;
}

/** Thong tin lan uong thuoc tiep theo + dem nguoc */
export function getMedicationScheduleInfo(medications) {
  if (!medications || medications.length === 0) {
    return { state: "none", countdownText: "--:--:--", label: "No medicines scheduled" };
  }

  const due = getDueMedications(medications);
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

  for (const med of medications) {
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

/** Format giay thanh HH:MM:SS */
export function formatCountdown(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
