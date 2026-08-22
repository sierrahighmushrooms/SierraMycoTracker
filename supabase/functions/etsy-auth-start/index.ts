// Supabase Edge Function: etsy-auth-start
// Initiates OAuth 2.0 PKCE flow for Etsy API v3

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

// Helper: Generate base64url encoded random string for PKCE
function generateRandomString(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Helper: Calculate SHA-256 base64url challenge
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const etsyClientId = Deno.env.get("ETSY_KEYSTRING") || "defw08dcohinep37tx3vdgmm";

    // Authenticate user via Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // User client to verify auth
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized user" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const body = await req.json().catch(() => ({}));
    const redirectUri = body.redirect_uri || `${supabaseUrl}/functions/v1/etsy-auth-callback`;
    const clientRedirectUrl = body.client_redirect_url || "http://localhost:5500/index.html";

    // Generate PKCE code verifier, challenge and state
    const codeVerifier = generateRandomString(44);
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateRandomString(24);

    // Store verifier and state in Supabase DB using admin client
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { error: upsertError } = await adminClient
      .from("etsy_integrations")
      .upsert({
        user_id: user.id,
        pkce_code_verifier: codeVerifier,
        state: state,
        access_token: "pending",
        refresh_token: "pending",
        expires_at: new Date(Date.now() + 600000).toISOString() // 10 min expiry placeholder
      }, { onConflict: "user_id" });

    if (upsertError) {
      console.error("Failed to store PKCE verifier:", upsertError);
      return new Response(JSON.stringify({ error: "Failed to initialize Etsy authorization session" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Build Etsy OAuth URL
    // Scopes: listings_r, listings_w, transactions_r
    const scopes = ["listings_r", "listings_w", "transactions_r"].join("%20");
    const authUrl = `https://www.etsy.com/oauth/connect?response_type=code&client_id=${etsyClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

    return new Response(JSON.stringify({
      auth_url: authUrl,
      state: state
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("etsy-auth-start exception:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});