"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// Supabase credentials from original MycoTrack config
const SUPABASE_URL = "https://wsalxxsjnxptoeduwfqw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_BotNKDv8qzsonc1Rf3rEkQ_-s8K1esY";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: "signin" | "signup";
}

export default function AuthModal({ isOpen, onClose, defaultTab = "signin" }: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<"signin" | "signup">(defaultTab);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (activeTab === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        setMessage({ type: "success", text: "Signed in successfully!" });
        setUser(data.user);
        
        // Redirect to main app after successful login
        setTimeout(() => {
          window.location.href = "https://sierramycolab.com";
        }, 1000);
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) throw error;

        if (data.user?.identities?.length === 0) {
          setMessage({ type: "error", text: "An account with this email already exists." });
        } else {
          setMessage({ type: "success", text: "Check your email for a confirmation link!" });
        }
      }
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "An error occurred" });
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setUser(null);
    setLoading(false);
    onClose();
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setMessage({ type: "error", text: "Please enter your email address first." });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      setMessage({ type: "success", text: "Password reset email sent! Check your inbox." });
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "Failed to send reset email" });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-6 animate-fade-in mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">Authentication</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl leading-none transition"
          >
            ✕
          </button>
        </div>

        <div className="mt-4">
          {user ? (
            // Logged In View
            <div className="space-y-4">
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-center">
                <div className="text-3xl mb-2">👤</div>
                <div className="text-sm text-slate-400 mb-1">Logged in as</div>
                <div className="text-lg font-bold text-white break-all">{user.email}</div>
                <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-700/60 px-2.5 py-1 rounded-full">
                  ☁️ Cloud Sync Active
                </div>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={loading}
                className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold py-2.5 rounded-lg transition text-sm disabled:opacity-50"
              >
                {loading ? "Signing out..." : "Sign Out"}
              </button>
              <a
                href="https://sierramycolab.com"
                className="block w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 rounded-lg transition text-sm text-center"
              >
                Go to Dashboard →
              </a>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="flex mb-4">
                <button
                  type="button"
                  onClick={() => setActiveTab("signin")}
                  className={`flex-1 py-2 font-semibold text-center border-b-2 transition ${
                    activeTab === "signin"
                      ? "text-slate-300 border-amber-500"
                      : "text-slate-400 border-slate-800"
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("signup")}
                  className={`flex-1 py-2 font-semibold text-center border-b-2 transition ${
                    activeTab === "signup"
                      ? "text-slate-300 border-amber-500"
                      : "text-slate-400 border-slate-800"
                  }`}
                >
                  Sign Up
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="auth-email"
                      className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1"
                    >
                      Email
                    </label>
                    <input
                      type="email"
                      id="auth-email"
                      required
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="auth-password"
                      className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1"
                    >
                      Password
                    </label>
                    <input
                      type="password"
                      id="auth-password"
                      required
                      autoComplete={activeTab === "signin" ? "current-password" : "new-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    />
                  </div>

                  {message && (
                    <div
                      className={`text-xs font-semibold p-2 rounded ${
                        message.type === "error"
                          ? "text-red-400 bg-red-950/50"
                          : "text-emerald-400 bg-emerald-950/50"
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
                    {loading
                      ? "Please wait..."
                      : activeTab === "signin"
                      ? "Sign In"
                      : "Sign Up"}
                  </button>
                </div>
              </form>

              {activeTab === "signin" && (
                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-xs text-amber-400 hover:text-amber-300 transition"
                  >
                    Forgot password?
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Export a hook to manage auth modal state
export function useAuthModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [defaultTab, setDefaultTab] = useState<"signin" | "signup">("signin");

  const openAuthModal = (tab: "signin" | "signup" = "signin") => {
    setDefaultTab(tab);
    setIsOpen(true);
  };

  const closeAuthModal = () => {
    setIsOpen(false);
  };

  return {
    isOpen,
    defaultTab,
    openAuthModal,
    closeAuthModal,
  };
}
