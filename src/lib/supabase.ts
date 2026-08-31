import { createClient } from "@supabase/supabase-js";

// Public project credentials. The anon/publishable key is safe to ship to the
// browser; row-level security enforces access on the server. Kept in one place
// so the landing page and any future routes never drift out of sync.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://wsalxxsjnxptoeduwfqw.supabase.co";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_BotNKDv8qzsonc1Rf3rEkQ_-s8K1esY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
