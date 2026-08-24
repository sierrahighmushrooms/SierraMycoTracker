// Supabase Edge Function: square-oauth
// Handles Square OAuth token exchange, direct initiation, and disconnect for connected grower organizations.
//
// SECURITY: organization_id is never trusted directly from a client-supplied
// body/query value. Every action resolves the caller's identity from their
// verified JWT and checks organization_members before binding any Square
// token to an organization. The OAuth `state` parameter is HMAC-signed
// (see ../_shared/auth.ts) so it can carry the organization id across the
// redirect to Square and back without being forgeable by a client.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAuthorizedOrg, isOrgAuthError, signOAuthState, verifyOAuthState } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const squareApplicationId = Deno.env.get("SQUARE_APPLICATION_ID") || "sq0idp-T2BxJMzFqiatyH5XW4iX1g";
    const squareApplicationSecret = Deno.env.get("SQUARE_APPLICATION_SECRET") || "";
    const squareEnvironment = Deno.env.get("SQUARE_ENVIRONMENT") || "production";

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const isSandbox = squareApplicationId.startsWith('sandbox-') || squareEnvironment === 'sandbox';
    const squareApiHost = isSandbox
      ? "https://connect.squareupsandbox.com"
      : "https://connect.squareup.com";

    const defaultOAuthRedirectUri = Deno.env.get('SQUARE_REDIRECT_URI') || `${supabaseUrl}/functions/v1/square-oauth`;
    const defaultAppRedirectTarget = Deno.env.get('APP_REDIRECT_URL') || 'http://127.0.0.1:5500/index.html';

    // Handle GET requests (Square's redirect back to us — the OAuth callback only).
    // Initiation is POST-only (action: "start") so we can verify the caller's
    // JWT before minting a signed state; a plain top-level GET navigation
    // can't carry an Authorization header, so it is no longer trusted to
    // pick which organization gets connected.
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      const errorDescription = url.searchParams.get('error_description');

      if (!code && !error) {
        return new Response(JSON.stringify({
          error: "This endpoint only accepts the Square OAuth callback via GET. To start a connection, POST { action: 'start', organization_id } with an authenticated session."
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // CALLBACK FLOW (GET with 'code' or 'error')
      console.log('Square OAuth GET callback received:', { code: code ? '***' : null, state: state ? '***' : null, error, errorDescription });

      if (error) {
        console.error("Square OAuth error callback:", error, errorDescription);
        return Response.redirect(`${defaultAppRedirectTarget}?square_error=${encodeURIComponent(errorDescription || error)}`, 302);
      }

      if (!code) {
        return Response.redirect(`${defaultAppRedirectTarget}?square_error=${encodeURIComponent("Missing authorization code")}`, 302);
      }

      if (!squareApplicationSecret) {
        console.error("Missing SQUARE_APPLICATION_SECRET in Supabase secrets.");
        return Response.redirect(`${defaultAppRedirectTarget}?square_error=${encodeURIComponent("SQUARE_APPLICATION_SECRET missing in server secrets")}`, 302);
      }

      // Verify the signed state before doing anything else. This proves the
      // request originated from a /start call we authorized for this org,
      // and that it hasn't expired or been tampered with.
      const targetOrgId = await verifyOAuthState(state, squareApplicationSecret);
      if (!targetOrgId) {
        console.error("Square OAuth callback: invalid or expired state parameter");
        return Response.redirect(`${defaultAppRedirectTarget}?square_error=${encodeURIComponent("OAuth state is invalid or expired. Please try connecting again.")}`, 302);
      }

      console.log('Exchanging code for token with Square API...');
      const tokenResp = await fetch(`${squareApiHost}/oauth2/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Square-Version": "2024-01-18"
        },
        body: JSON.stringify({
          client_id: squareApplicationId,
          client_secret: squareApplicationSecret,
          code: code,
          grant_type: "authorization_code",
          redirect_uri: defaultOAuthRedirectUri
        })
      });

      console.log('Square API Token Response Status:', tokenResp.status);

      const tokenData = await tokenResp.json();
      if (!tokenResp.ok || tokenData.errors) {
        console.error("Square Token Exchange Error:", tokenData);
        const errMsg = tokenData.errors?.[0]?.detail || "Token exchange failed";
        return Response.redirect(`${defaultAppRedirectTarget}?square_error=${encodeURIComponent(errMsg)}`, 302);
      }

      const { access_token, refresh_token, expires_at, merchant_id } = tokenData;
      console.log('Square Token exchange successful. Merchant ID:', merchant_id);

      // Fetch current organization settings to ensure JSONB is also updated
      const { data: currentOrg } = await supabaseAdmin
        .from("organizations")
        .select("settings")
        .eq("id", targetOrgId)
        .maybeSingle();

      const updatedSettings = {
        ...(currentOrg?.settings || {}),
        square_merchant_id: merchant_id,
        square_connected_at: new Date().toISOString()
      };

      const { error: dbErr } = await supabaseAdmin
        .from("organizations")
        .update({
          square_connected: true,
          square_access_token: access_token,
          square_refresh_token: refresh_token,
          square_merchant_id: merchant_id,
          square_token_expires_at: expires_at ? new Date(expires_at).toISOString() : null,
          square_connected_at: new Date().toISOString(),
          settings: updatedSettings
        })
        .eq("id", targetOrgId);

      if (dbErr) {
        console.error('CRITICAL DB UPDATE ERROR:', dbErr);
        return Response.redirect(`${defaultAppRedirectTarget}?square_error=${encodeURIComponent("Failed to save Square connection")}`, 302);
      }

      console.log('SUCCESSFULLY SAVED SQUARE TOKENS FOR ORG:', targetOrgId);
      return Response.redirect(`${defaultAppRedirectTarget}?square=connected&merchant_id=${encodeURIComponent(merchant_id || "")}`, 302);
    }

    // Handle POST requests
    let body: any = {};
    if (req.method === 'POST') {
      try {
        body = await req.json();
      } catch (_) {
        body = {};
      }
    }

    const { action, code, redirect_uri, organization_id } = body;

    // Action: Start Square OAuth flow (Generate authorize URL).
    // Requires an authenticated caller who is a member of organization_id.
    if (action === "start" || action === "authorize_url") {
      if (!squareApplicationSecret) {
        return new Response(JSON.stringify({ error: "SQUARE_APPLICATION_SECRET missing in server secrets" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const authResult = await resolveAuthorizedOrg(req, supabaseUrl, supabaseServiceKey, organization_id);
      if (isOrgAuthError(authResult)) {
        return new Response(JSON.stringify({ error: authResult.error }), {
          status: authResult.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const targetRedirectUri = defaultOAuthRedirectUri;
      const scopes = ['ITEMS_READ', 'ITEMS_WRITE', 'ORDERS_READ', 'ORDERS_WRITE', 'PAYMENTS_READ', 'MERCHANT_PROFILE_READ'];
      const stateParam = await signOAuthState(authResult.organizationId, squareApplicationSecret);

      const authUrl = new URL(`${squareApiHost}/oauth2/authorize`);
      authUrl.searchParams.set('client_id', squareApplicationId);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', scopes.join(' '));
      authUrl.searchParams.set('redirect_uri', targetRedirectUri);
      authUrl.searchParams.set('session', 'false');
      authUrl.searchParams.set('state', stateParam);

      return new Response(JSON.stringify({
        success: true,
        url: authUrl.toString(),
        is_sandbox: isSandbox,
        client_id: squareApplicationId,
        redirect_uri: targetRedirectUri
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Every remaining action mutates a specific organization's Square
    // connection, so bind organization_id to the caller's verified membership.
    const authResult = await resolveAuthorizedOrg(req, supabaseUrl, supabaseServiceKey, organization_id);
    if (isOrgAuthError(authResult)) {
      return new Response(JSON.stringify({ error: authResult.error }), {
        status: authResult.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const verifiedOrgId = authResult.organizationId;

    // Action: Disconnect Square
    if (action === "disconnect") {
      const { error: updateError } = await supabaseAdmin
        .from("organizations")
        .update({
          square_connected: false,
          square_merchant_id: null,
          square_access_token: null,
          square_refresh_token: null,
          square_token_expires_at: null,
          square_connected_at: null
        })
        .eq("id", verifiedOrgId);

      if (updateError) {
        console.error("Supabase disconnect error:", updateError);
        throw updateError;
      }

      return new Response(JSON.stringify({ success: true, message: "Square account disconnected" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Action: Exchange OAuth code for access token
    if (!code) {
      return new Response(JSON.stringify({ error: "authorization code is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Exchange token with Square OAuth API
    const tokenResp = await fetch(`${squareApiHost}/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Square-Version": "2024-01-18"
      },
      body: JSON.stringify({
        client_id: squareApplicationId,
        client_secret: squareApplicationSecret,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: redirect_uri || defaultOAuthRedirectUri
      })
    });

    const tokenData = await tokenResp.json();

    if (!tokenResp.ok || tokenData.errors) {
      console.error("Square OAuth Token Error:", tokenData);
      return new Response(JSON.stringify({
        error: tokenData.errors?.[0]?.detail || "Failed to exchange authorization code with Square"
      }), {
        status: tokenResp.status || 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const {
      access_token,
      refresh_token,
      expires_at,
      merchant_id
    } = tokenData;

    // Persist token and merchant ID to the organization record using supabaseAdmin
    const { error: dbError } = await supabaseAdmin
      .from("organizations")
      .update({
        square_connected: true,
        square_merchant_id: merchant_id,
        square_access_token: access_token,
        square_refresh_token: refresh_token,
        square_token_expires_at: expires_at ? new Date(expires_at).toISOString() : null,
        square_connected_at: new Date().toISOString()
      })
      .eq("id", verifiedOrgId);

    if (dbError) {
      console.error("Supabase update error:", dbError);
      throw dbError;
    }

    return new Response(JSON.stringify({
      success: true,
      merchant_id: merchant_id,
      expires_at: expires_at
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("Square OAuth Edge Function Exception:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
