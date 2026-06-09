/**
 * auth.js - Local auth (khong can Supabase)
 */

import { seedDemoDataIfEmpty } from "./supabase-client.js";

const LOCAL_SESSION = { user: { id: "local-user", email: "user@local" } };

export async function loginWithPassword(email) {
  if (email) localStorage.setItem("sc_email", email);
  return LOCAL_SESSION;
}

export async function logout() {
  window.location.href = "/";
}

export async function onAuthReady(session) {
  if (!session) return;
  await seedDemoDataIfEmpty();
}

export async function handleAuthCallback() {
  return LOCAL_SESSION;
}

export async function getCurrentUserEmail() {
  return localStorage.getItem("sc_email") || "user@local";
}

export function initLoginPage() {
  // Khong can dang nhap, chuyen thang ve trang chu
  window.location.href = "/";
}
