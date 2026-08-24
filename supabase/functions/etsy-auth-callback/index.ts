// Supabase Edge Function: etsy-auth-callback
// Handles OAuth 2.0 PKCE token exchange and stores Etsy credentials

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const etsyClientId = Deno.env.get("ETSY_KEYSTRING") || "defw08dcohinep37tx3vdgmm";
    // As of Etsy's Feb 9 2026 shared-secret enforcement, every v3 REST call
    // (not the OAuth token endpoint itself) must send "x-api-key" as
    // "<keystring>:<shared secret>", not the keystring alone. Missing this
    // was returning a 403 "Shared secret is required in x-api-key header"
    // on the shop lookup below, silently leaving etsy_shop_id null.
    const etsySharedSecret = Deno.env.get("ETSY_SHARED_SECRET") || "";
    if (!etsySharedSecret) {
      console.error("etsy-auth-callback: ETSY_SHARED_SECRET is not set -- Etsy v3 REST calls (shop lookup) will 403.");
    }
    const etsyApiKeyHeader = etsySharedSecret ? `${etsyClientId}:${etsySharedSecret}` : etsyClientId;

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    const defaultRedirectTarget = Deno.env.get("APP_REDIRECT_URL") || "http://127.0.0.1:5500/index.html";

    if (errorParam) {
      console.error("Etsy OAuth error:", errorParam, errorDescription);
      return Response.redirect(`${defaultRedirectTarget}?etsy_error=${encodeURIComponent(errorDescription || errorParam)}`, 302);
    }

    if (!code || !state) {
      return Response.redirect(`${defaultRedirectTarget}?etsy_error=${encodeURIComponent("Missing code or state parameter")}`, 302);
    }

    // Service-role client: required because this write happens with no
    // authenticated end-user session (Etsy's redirect carries no Supabase
    // JWT), and etsy_integrations RLS is scoped to auth.uid() = user_id.
    // This is unrelated to the organizations RLS lockdown -- this function
    // never reads or writes the organizations table.
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Look up user integration session matching this state. state is set
    // by etsy-auth-start (crypto.randomUUID(), stored on the same row as
    // pkce_code_verifier) -- unchanged by the Phase 2 auth hardening, so
    // this lookup remains compatible.
    const { data: integration, error: findError } = await adminClient
      .from("etsy_integrations")
      .select("*")
      .eq("state", state)
      .maybeSingle();

    if (findError || !integration || !integration.pkce_code_verifier) {
      console.error("etsy-auth-callback: state verification failed or expired session.", {
        state,
        findError,
        foundIntegration: !!integration,
        hasPkceVerifier: !!integration?.pkce_code_verifier
      });
      return Response.redirect(`${defaultRedirectTarget}?etsy_error=${encodeURIComponent("OAuth state expired or invalid. Please try connecting again.")}`, 302);
    }

    const redirectUri = Deno.env.get("ETSY_REDIRECT_URI") || `${supabaseUrl}/functions/v1/etsy-auth-callback`;

    // Exchange authorization code + PKCE code_verifier for Access and Refresh tokens
    let tokenResp: Response;
    try {
      tokenResp = await fetch("https://api.etsy.com/v3/public/oauth/token", {
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
    } catch (fetchErr: any) {
      console.error("etsy-auth-callback: token exchange fetch threw (network/DNS/etc.):", fetchErr?.message || fetchErr);
      return Response.redirect(`${defaultRedirectTarget}?etsy_error=${encodeURIComponent("Could not reach Etsy to exchange the authorization code.")}`, 302);
    }

    const tokenData = await tokenResp.json();

    if (!tokenResp.ok || tokenData.error) {
      console.error("etsy-auth-callback: Etsy token exchange error.", {
        status: tokenResp.status,
        body: tokenData
      });
      return Response.redirect(`${defaultRedirectTarget}?etsy_error=${encodeURIComponent(tokenData.error_description || tokenData.error || "Token exchange failed")}`, 302);
    }

    console.log("etsy-auth-callback: token exchange succeeded.", {
      hasAccessToken: !!tokenData.access_token,
      hasRefreshToken: !!tokenData.refresh_token,
      expiresIn: tokenData.expires_in
    });

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
          "x-api-key": etsyApiKeyHeader,
          "Authorization": `Bearer ${access_token}`
        }
      });
      if (meResp.ok) {
        const shopData = await meResp.json();
        etsyShopId = shopData.shop_id ? String(shopData.shop_id) : null;
        etsyShopName = shopData.shop_name || null;
        if (!etsyShopId) {
          // This is the failure mode that leaves the connection looking
          // "Not Connected" in the UI even though tokens saved fine: the
          // frontend's connected check requires etsy_shop_id to be set.
          console.error("etsy-auth-callback: shop lookup returned 200 but no shop_id in the response body.", { etsyUserId, shopData });
        }
      } else {
        const errorBody = await meResp.text().catch(() => "<unreadable body>");
        console.error("etsy-auth-callback: shop lookup request failed (etsy_shop_id will be null, connection will appear as Not Connected).", {
          etsyUserId,
          status: meResp.status,
          body: errorBody
        });
      }
    } catch (shopErr: any) {
      console.error("etsy-auth-callback: shop lookup fetch threw (network/DNS/etc.); etsy_shop_id will be null.", { etsyUserId, error: shopErr?.message || shopErr });
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
      console.error("etsy-auth-callback: failed to persist Etsy integration to the database.", {
        integrationId: integration.id,
        updateError
      });
      return Response.redirect(`${defaultRedirectTarget}?etsy_error=db_save_failed`, 302);
    }

    console.log("etsy-auth-callback: etsy_integrations row updated successfully.", {
      integrationId: integration.id,
      etsyShopId,
      etsyShopName
    });

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