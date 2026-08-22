// Sierra Myco Lab - Etsy API v3 Integration Client Module

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { getSupabaseClient, currentOrganizationId } from './db.js';
import { showToast } from './utils.js';

/**
 * Initiates the OAuth 2.0 PKCE flow for Etsy.
 * Requests authorization URL from the edge function and redirects the browser.
 */
export async function connectEtsy() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    showToast('Supabase client not initialized.', 'error');
    return;
  }

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) {
    showToast('You must be logged in to connect Etsy.', 'error');
    return;
  }

  try {
    showToast('Connecting to Etsy...', 'info');

    const redirectUri = `${SUPABASE_URL}/functions/v1/etsy-auth-callback`;
    const clientRedirectUrl = `${window.location.origin}/dashboard.html`;

    const response = await fetch(`${SUPABASE_URL}/functions/v1/etsy-auth-start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        redirect_uri: redirectUri,
        client_redirect_url: clientRedirectUrl,
        organization_id: currentOrganizationId
      })
    });

    const result = await response.json();

    if (!response.ok || result.error) {
      throw new Error(result.error || 'Failed to initialize Etsy connection.');
    }

    if (result.auth_url) {
      // Redirect user to Etsy OAuth consent screen
      window.location.href = result.auth_url;
    } else {
      throw new Error('No authorization URL returned.');
    }
  } catch (err) {
    console.error('Etsy OAuth connection error:', err);
    showToast(err.message || 'Error initiating Etsy connection', 'error');
  }
}

/**
 * Checks if the current user/organization has an active Etsy connection.
 */
export async function fetchEtsyIntegrationStatus() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('etsy_integrations')
    .select('id, user_id, etsy_shop_id, etsy_shop_name, expires_at, created_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('Error fetching Etsy integration status:', error);
    return null;
  }

  return data;
}

/**
 * Disconnects the current Etsy store integration.
 */
export async function disconnectEtsy() {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('etsy_integrations')
    .delete()
    .eq('user_id', user.id);

  if (error) {
    showToast('Failed to disconnect Etsy.', 'error');
    console.error(error);
  } else {
    showToast('Etsy integration disconnected.', 'success');
  }
}

/**
 * Triggers initial inventory import from Etsy via Edge Function.
 */
export async function importEtsyListings() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    showToast('Supabase client not initialized.', 'error');
    return null;
  }

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) {
    showToast('You must be logged in to import Etsy listings.', 'error');
    return null;
  }

  try {
    showToast('Importing listings from Etsy...', 'info');

    const response = await fetch(`${SUPABASE_URL}/functions/v1/etsy-import-listings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${session.access_token}`
      }
    });

    const result = await response.json();

    if (!response.ok || result.error) {
      throw new Error(result.error || 'Failed to import Etsy listings.');
    }

    showToast(`Successfully imported ${result.total_listings_imported} listings (${result.total_skus_mapped} SKUs)!`, 'success');
    return result;
  } catch (err) {
    console.error('Etsy import error:', err);
    showToast(err.message || 'Error importing Etsy listings', 'error');
    return null;
  }
}

/**
 * Fetch all local SKU mappings for the user/organization.
 */
export async function fetchSkuMappings() {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('sku_mappings')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching SKU mappings:', error);
    return [];
  }

  return data || [];
}
