/**
 * medications.js - Trang quan ly thuoc
 */

import {
  requireAuth, fetchMedications, getDueMedications, logMedicationTaken,
  fetchTodayMedicationLogs, buildTakenTodaySet,
} from "./supabase-client.js";
import { onAuthReady } from "./auth.js";
import { getSupabase } from "./supabase-client.js";

let session = null;

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

async function renderList() {
  const list = document.getElementById("med-list");
  const meds = await fetchMedications();
  const logs = await fetchTodayMedicationLogs();
  const takenIds = buildTakenTodaySet(logs);
  const due = getDueMedications(meds, 30, takenIds);
  const dueIds = new Set(due.map((m) => m.id));

  if (meds.length === 0) {
    list.innerHTML = `<p class="text-slate-400 text-center py-8">No medications yet. Tap Add below.</p>`;
    return;
  }

  list.innerHTML = meds.map((m) => {
    const taken = takenIds.has(m.id);
    return `
    <div class="list-card ${dueIds.has(m.id) ? "due" : ""}" data-id="${m.id}">
      <div>
        <div class="font-bold text-lg">${escapeHtml(m.name)}</div>
        <div class="text-slate-400">${escapeHtml(m.time)}${m.dose ? ` · ${escapeHtml(m.dose)}` : ""}</div>
        ${taken ? '<span class="badge-due mt-2 inline-block" style="background:#16a34a;color:#fff">Taken today</span>' : ""}
        ${dueIds.has(m.id) ? '<span class="badge-due mt-2 inline-block">Due now</span>' : ""}
      </div>
      <div class="flex flex-col gap-2">
        ${dueIds.has(m.id) ? `<button class="quick-btn bg-green-600 text-white took-btn" data-id="${m.id}">I took it</button>` : ""}
        <button class="quick-btn bg-red-700 text-white remove-btn" data-id="${m.id}">Remove</button>
      </div>
    </div>
  `;
  }).join("");

  list.querySelectorAll(".took-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await logMedicationTaken(btn.dataset.id, session.user.id);
      renderList();
    });
  });

  list.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Remove this medicine?")) return;
      const sb = await getSupabase();
      await sb.from("medications").delete().eq("id", btn.dataset.id);
      renderList();
    });
  });
}

function setupAddForm() {
  document.getElementById("add-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("med-name").value.trim();
    const time = document.getElementById("med-time").value.trim();
    const dose = document.getElementById("med-dose").value.trim();
    if (!name || !time) return;

    const sb = await getSupabase();
    const { error } = await sb.from("medications").insert({
      name, time, dose, user_id: session.user.id,
    });
    if (error) {
      alert("Could not add. Use time format HH:MM (e.g. 08:00).");
      return;
    }
    document.getElementById("add-form").reset();
    renderList();
  });
}

async function init() {
  session = await requireAuth();
  if (!session) return;
  await onAuthReady(session);
  setupAddForm();
  renderList();
}

init();
