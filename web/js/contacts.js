/**
 * contacts.js - Trang danh ba + goi dien that (tel:)
 */

import { requireAuth, fetchContacts } from "./supabase-client.js";
import { onAuthReady } from "./auth.js";
import { getSupabase } from "./supabase-client.js";

let session = null;

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function callPhone(phone, name) {
  const cleaned = phone.replace(/\s/g, "");
  if (confirm(`Call ${name} at ${phone}?`)) {
    window.location.href = `tel:${cleaned}`;
  }
}

async function renderList() {
  const list = document.getElementById("contact-list");
  const contacts = await fetchContacts();

  if (contacts.length === 0) {
    list.innerHTML = `<p class="text-slate-400 text-center py-8">No contacts yet. Tap Add below.</p>`;
    return;
  }

  list.innerHTML = contacts.map((c) => `
    <div class="list-card">
      <div>
        <div class="font-bold text-lg capitalize">${escapeHtml(c.name)}</div>
        <div class="text-slate-400">${escapeHtml(c.phone)}</div>
      </div>
      <button class="quick-btn bg-green-600 text-white call-btn"
              data-phone="${escapeHtml(c.phone)}" data-name="${escapeHtml(c.name)}">
        Call
      </button>
    </div>
  `).join("");

  list.querySelectorAll(".call-btn").forEach((btn) => {
    btn.addEventListener("click", () => callPhone(btn.dataset.phone, btn.dataset.name));
  });
}

function setupAddForm() {
  document.getElementById("add-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("contact-name").value.trim();
    const phone = document.getElementById("contact-phone").value.trim();
    if (!name || !phone) return;

    const sb = await getSupabase();
    const { error } = await sb.from("contacts").insert({
      name: name.toLowerCase(), phone, user_id: session.user.id,
    });
    if (error) { alert("Could not add contact."); return; }
    document.getElementById("add-form").reset();
    renderList();
  });
}

function setupEmergency() {
  document.getElementById("emergency-btn")?.addEventListener("click", async () => {
    const contacts = await fetchContacts();
    const emergency = contacts.find((c) => c.name.toLowerCase() === "emergency");
    const phone = emergency?.phone || "911";
    callPhone(phone, "Emergency");
  });
}

async function init() {
  session = await requireAuth();
  if (!session) return;
  await onAuthReady(session);
  setupAddForm();
  setupEmergency();
  renderList();
}

init();
