/**
 * auth.js - Supabase authentication (email + password, dang nhap ngay)
 */

import { getSupabase, seedDemoDataIfEmpty } from "./supabase-client.js";

/** Dang nhap bang email + mat khau. Neu chua co tai khoan thi tu dong dang ky. */
export async function loginWithPassword(email, password) {
  const sb = await getSupabase();
  const trimmedEmail = email.trim();
  const trimmedPassword = password.trim();

  // Thu dang nhap truoc
  let { data, error } = await sb.auth.signInWithPassword({
    email: trimmedEmail,
    password: trimmedPassword,
  });

  // Chua co tai khoan -> tu dong tao moi (can tat Confirm email tren Supabase)
  if (error) {
    const msg = (error.message || "").toLowerCase();
    const notFound = msg.includes("invalid") || msg.includes("credentials") || msg.includes("not found");
    if (notFound) {
      const { data: signUpData, error: signUpError } = await sb.auth.signUp({
        email: trimmedEmail,
        password: trimmedPassword,
      });
      if (signUpError) throw signUpError;
      if (signUpData.session) {
        data = signUpData;
        error = null;
      } else {
        // Thu dang nhap lai sau khi dang ky
        const retry = await sb.auth.signInWithPassword({
          email: trimmedEmail,
          password: trimmedPassword,
        });
        data = retry.data;
        error = retry.error;
      }
    }
  }

  if (error) throw error;
  if (!data.session) {
    throw new Error(
      "Could not sign in. In Supabase, turn OFF 'Confirm email' under Authentication → Providers → Email."
    );
  }
  return data.session;
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

/** Kiem tra session hien tai */
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

  getSupabase().then(async (sb) => {
    const { data: { session } } = await sb.auth.getSession();
    if (session) window.location.href = "/";
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    if (!email || !password) return;

    btn.disabled = true;
    msg.textContent = "Signing in...";
    msg.className = "text-sky-400 text-center mt-4";

    try {
      const session = await loginWithPassword(email, password);
      await onAuthReady(session);
      window.location.href = "/";
    } catch (err) {
      msg.textContent = err.message || "Sign in failed. Please try again.";
      msg.className = "text-red-400 text-center mt-4";
      btn.disabled = false;
    }
  });
}
