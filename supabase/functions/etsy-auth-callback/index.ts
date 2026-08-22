// Supabase Edge Function: etsy-auth-callback
// Handles OAuth 2.0 PKCE token exchange and stores Etsy credentials

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const etsyClientId = Deno.env.get("ETSY_KEYSTRING") || "defw08dcohinep37tx3vdgmm";

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    const defaultRedirectTarget = "http://localhost:5500/dashboard.html";

    if (errorParam) {
      console.error("Etsy OAuth error:", errorParam, errorDescription);
      return Response.redirect(`${defaultRedirectTarget}?etsy_error=${encodeURIComponent(errorDescription || errorParam)}`, 302);
    }

    if (!code || !state) {
      return new Response(JSON.stringify({ error: "Missing code or state parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Look up user integration session matching this state
    const { data: integration, error: findError } = await adminClient
      .from("etsy_integrations")
      .select("*")
      .eq("state", state)
      .single();

    if (findError || !integration || !integration.pkce_code_verifier) {
      console.error("State verification failed or expired session:", findError);
      return Response.redirect(`${defaultRedirectTarget}?etsy_error=session_expired_or_invalid`, 302);
    }

    const redirectUri = `${supabaseUrl}/functions/v1/etsy-auth-callback`;

    // Exchange authorization code + PKCE code_verifier for Access and Refresh tokens
    const tokenResp = await fetch("https://api.etsy.com/v3/public/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: etsyClientId,
        redirect_uri: redirectUri,
        code: code,
        code_verifier: integration.pkce_code_verifier
      })
    });

    const tokenData = await tokenResp.json();

    if (!tokenResp.ok || tokenData.error) {
      console.error("Etsy Token Exchange Error:", tokenData);
      return Response.redirect(`${defaultRedirectTarget}?etsy_error=${encodeURIComponent(tokenData.error_description || tokenData.error || "Token exchange failed")}`, 302);
    }

    const {
      access_token,
      refresh_token,
      expires_in,
      token_type
    } = tokenData;

    // Calculate expiration timestamp
    const expiresAt = new Date(Date.now() + (expires_in || 3600) * 1000).toISOString();

    // Fetch Etsy User & Shop details to populate etsy_user_id and etsy_shop_id
    // First: extract user id (the token contains the numeric Etsy user ID as standard prefix before '.')
    const etsyUserId = tokenData.access_token.split(".")[0];
    let etsyShopId = null;
    let etsyShopName = null;

    try {
      const meResp = await fetch(`https://openapi.etsy.com/v3/application/users/${etsyUserId}/shops`, {
        headers: {
          "x-api-key": etsyClientId,
          "Authorization": `Bearer ${access_token}`
        }
      });
      if (meResp.ok) {
        const shopData = await meResp.json();
        etsyShopId = shopData.shop_id ? String(shopData.shop_id) : null;
        etsyShopName = shopData.shop_name || null;
      }
    } catch (shopErr) {
      console.warn("Could not fetch Etsy shop details immediately:", shopErr);
    }

    // Save tokens and clear temporary PKCE state
    const { error: updateError } = await adminClient
      .from("etsy_integrations")
      .update({
        etsy_user_id: etsyUserId,
        etsy_shop_id: etsyShopId,
        etsy_shop_name: etsyShopName,
        access_token: access_token,
        refresh_token: refresh_token,
        token_type: token_type || "bearer",
        expires_at: expiresAt,
        pkce_code_verifier: null,
        state: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", integration.id);

    if (updateError) {
      console.error("Failed to persist Etsy integration:", updateError);
      return Response.redirect(`${defaultRedirectTarget}?etsy_error=db_save_failed`, 302);
    }

    // Success: Redirect back to the local dashboard
    return Response.redirect(`${defaultRedirectTarget}?etsy_connected=true&shop_name=${encodeURIComponent(etsyShopName || "")}&shop_id=${encodeURIComponent(etsyShopId || "")}`, 302);

  } catch (err: any) {
    console.error("etsy-auth-callback exception:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});