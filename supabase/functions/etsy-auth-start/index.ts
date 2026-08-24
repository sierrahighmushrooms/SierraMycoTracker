// Supabase Edge Function: etsy-auth-start
// Begins the Etsy OAuth (PKCE) flow and persists the pending state/verifier.
//
// SECURITY: the identity this request acts on behalf of is derived strictly
// from the caller's verified JWT, never from a client-supplied user_id in
// the request body — trusting the body there would let any caller forge
// another user's id and hijack their Etsy connection.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

Deno.serve(async (req) => {
  // 1. Immediate Preflight Response (Must happen before ANY logic)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('ETSY_KEYSTRING');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'ETSY_KEYSTRING is missing from Supabase secrets.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const callbackRedirectUri = Deno.env.get('ETSY_REDIRECT_URI') || `${supabaseUrl}/functions/v1/etsy-auth-callback`;

    // Require a verified session — this endpoint writes a pending OAuth
    // record keyed by user id, so the user id must come from the JWT.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const userId = user.id;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // organization_id is optional metadata on the integration row (Etsy is
    // primarily scoped per-user). Only trust a client-supplied value if the
    // caller is actually a member of that organization.
    let organizationId: string | null = null;
    let clientRedirectUrl: string | null = null;

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        clientRedirectUrl = body.client_redirect_url || null;
        const claimedOrgId = body.organization_id || null;
        if (claimedOrgId) {
          const { data: membership } = await adminClient
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', userId)
            .eq('organization_id', claimedOrgId)
            .maybeSingle();
          if (membership) {
            organizationId = claimedOrgId;
          }
        }
      } catch (_) {
        // No body or already consumed
      }
    }

    const state = crypto.randomUUID();
    const codeVerifier = crypto.randomUUID() + crypto.randomUUID(); // PKCE verifier

    // Store state and codeVerifier, scoped to the JWT-verified user only.
    await adminClient
      .from('etsy_integrations')
      .upsert({
        user_id: userId,
        organization_id: organizationId,
        state: state,
        pkce_code_verifier: codeVerifier,
        access_token: 'pending',
        refresh_token: 'pending',
        expires_at: new Date(Date.now() + 600000).toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    // Convert code verifier to challenge
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const etsyAuthUrl = new URL('https://www.etsy.com/oauth/connect');
    etsyAuthUrl.searchParams.set('response_type', 'code');
    etsyAuthUrl.searchParams.set('client_id', apiKey);
    etsyAuthUrl.searchParams.set('redirect_uri', callbackRedirectUri);
    etsyAuthUrl.searchParams.set('scope', 'listings_r transactions_r shops_r');
    etsyAuthUrl.searchParams.set('state', state);
    etsyAuthUrl.searchParams.set('code_challenge', codeChallenge);
    etsyAuthUrl.searchParams.set('code_challenge_method', 'S256');

    return new Response(
      JSON.stringify({ url: etsyAuthUrl.toString(), state }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error("etsy-auth-start runtime failure:", err);
    return new Response(
      JSON.stringify({ error: err.message || 'Internal Edge Function Error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
