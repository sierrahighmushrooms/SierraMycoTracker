"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const APP_URL = "https://sierramycolab.com/app/";

// How long to wait for Supabase to establish a recovery session from the URL
// before assuming the link was invalid or already used.
const RECOVERY_TIMEOUT_MS = 5000;

type Status = "verifying" | "ready" | "invalid";

export default function ResetPasswordPage() {
  const [status, setStatus] = useState<Status>("verifying");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    let settled = false;
    const markReady = () => {
      if (settled) return;
      settled = true;
      setStatus("ready");
    };
    const markInvalid = (text?: string) => {
      if (settled) return;
      settled = true;
      setStatus("invalid");
      if (text) setMessage({ type: "error", text });
    };

    // Supabase returns errors for expired/used links as URL parameters, in the
    // hash for the implicit flow (`#error=...&error_description=...`) and in the
    // query string for the PKCE flow (`?error=...`).
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const queryParams = new URLSearchParams(window.location.search);
    const urlError = hashParams.get("error_description") || queryParams.get("error_description");
    if (urlError) {
      markInvalid(decodeURIComponent(urlError.replace(/\+/g, " ")));
      return;
    }

    // This project uses supabase-js's default implicit flow, so the recovery
    // token arrives in the URL hash and `detectSessionInUrl` consumes it,
    // emitting PASSWORD_RECOVERY once the temporary session exists. The `?code=`
    // branch below is a safety net in case the flow is switched to PKCE later.
    const code = queryParams.get("code");
    if (code) {
      supabase.auth
        .exchangeCodeForSession(code)
        .then(({ error }) => (error ? markInvalid(error.message) : markReady()))
        .catch(() => markInvalid("This password reset link is invalid or has expired."));
    }

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) markReady();
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) markReady();
    });

    const timer = window.setTimeout(
      () => markInvalid("This password reset link is invalid or has expired. Request a new one from the sign-in screen."),
      RECOVERY_TIMEOUT_MS,
    );

    return () => {
      data.subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (password.length < 8) {
      setMessage({ type: "error", text: "Password must be at least 8 characters." });
      return;
    }
    if (password !== confirm) {
      setMessage({ type: "error", text: "Passwords do not match." });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMessage({ type: "success", text: "Password updated. Redirecting to your dashboard…" });
      window.setTimeout(() => {
        window.location.href = APP_URL;
      }, 1500);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Could not update password.";
      setMessage({ type: "error", text });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#030508] text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h1 className="text-xl font-bold text-white">Choose a new password</h1>

        {status === "verifying" && (
          <p className="mt-4 text-sm text-slate-400">Verifying your password-reset link…</p>
        )}

        {status === "invalid" && (
          <div className="mt-4 space-y-3">
            <div role="alert" className="text-xs font-semibold p-2 rounded text-red-400 bg-red-950/50">
              {message?.text ?? "This password reset link is invalid or has expired."}
            </div>
            <a
              href={APP_URL}
              className="block w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 rounded-lg transition text-sm text-center"
            >
              Back to sign in
            </a>
          </div>
        )}

        {status === "ready" && (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="new-password" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Confirm password
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>

            {message && (
              <div
                role="alert"
                className={`text-xs font-semibold p-2 rounded ${
                  message.type === "error" ? "text-red-400 bg-red-950/50" : "text-emerald-400 bg-emerald-950/50"
                }`}
              >
                {message.text}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 rounded-lg transition text-sm disabled:opacity-50"
            >
              {loading ? "Updating…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
