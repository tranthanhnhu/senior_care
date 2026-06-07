/**
 * auth.js - Supabase authentication (magic link)
 */

import { getSupabase, seedDemoDataIfEmpty } from "./supabase-client.js";

/** Gui magic link den email */
export async function sendMagicLink(email) {
  const sb = await getSupabase();
  const redirectTo = window.location.origin + "/";
  const { error } = await sb.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
}

/** Dang xuat */
export async function logout() {
  const sb = await getSupabase();
  await sb.auth.signOut();
  window.location.href = "/login";
}

/** Khoi tao sau khi dang nhap: seed demo neu can */
export async function onAuthReady(session) {
  if (!session) return;
  await seedDemoDataIfEmpty(session.user.id);
}

/** Xu ly callback magic link (hash fragment) */
export async function handleAuthCallback() {
  const sb = await getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await onAuthReady(session);
    return session;
  }
  return null;
}

/** Lay email hien tai */
export async function getCurrentUserEmail() {
  const sb = await getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  return session?.user?.email || "";
}

/** Khoi tao trang login */
export function initLoginPage() {
  const form = document.getElementById("login-form");
  const msg = document.getElementById("login-message");
  const btn = document.getElementById("login-btn");

  // Neu da co session -> chuyen ve home
  getSupabase().then(async (sb) => {
    const { data: { session } } = await sb.auth.getSession();
    if (session) window.location.href = "/";
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value;
    if (!email) return;
    btn.disabled = true;
    msg.textContent = "Sending magic link...";
    msg.className = "text-sky-400 text-center mt-4";
    try {
      await sendMagicLink(email);
      msg.textContent = "Check your email! Click the link to sign in.";
      msg.className = "text-green-400 text-center mt-4 text-lg";
    } catch (err) {
      msg.textContent = err.message || "Could not send link. Please try again.";
      msg.className = "text-red-400 text-center mt-4";
      btn.disabled = false;
    }
  });
}
