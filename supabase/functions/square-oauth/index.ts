// Supabase Edge Function: square-oauth
// Handles Square OAuth token exchange and disconnect for connected grower organizations.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const squareApplicationId = Deno.env.get("SQUARE_APPLICATION_ID") || "sq0idp-T2BxJMzFqiatyH5XW4iX1g";
    const squareApplicationSecret = Deno.env.get("SQUARE_APPLICATION_SECRET") || "";
    const squareEnvironment = Deno.env.get("SQUARE_ENVIRONMENT") || "production";

    const squareApiHost = squareEnvironment === "sandbox"
      ? "https://connect.squareupsandbox.com"
      : "https://connect.squareup.com";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { action, code, redirect_uri, organization_id } = body;

    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Action: Disconnect Square
    if (action === "disconnect") {
      const { error: updateError } = await supabase
        .from("organizations")
        .update({
          square_merchant_id: null,
          square_access_token: null,
          square_refresh_token: null,
          square_token_expires_at: null,
          square_connected_at: null
        })
        .eq("id", organization_id);

      if (updateError) {
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
        redirect_uri: redirect_uri || "https://sierramycolab.com/square-callback"
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

    // Persist token and merchant ID to the organization record
    const { error: dbError } = await supabase
      .from("organizations")
      .update({
        square_merchant_id: merchant_id,
        square_access_token: access_token,
        square_refresh_token: refresh_token,
        square_token_expires_at: expires_at ? new Date(expires_at).toISOString() : null,
        square_connected_at: new Date().toISOString()
      })
      .eq("id", organization_id);

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