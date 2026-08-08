// Storage layer: loads, mutates, and persists MycoTrack data to localStorage.
// Hybrid local/cloud sync: when Supabase is configured and a user session
// exists, items are merged with the Supabase `items` table (latest
// `updated_at` wins) and offline-created items are pushed back up.
// Offline / guest usage continues seamlessly from localStorage.

import { APP_CONFIG, SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Live mutable application state (single source of truth).
export const db = {
  items: JSON.parse(localStorage.getItem(APP_CONFIG.STORAGE_KEYS.ITEMS)) || [],
  pcBatches: JSON.parse(localStorage.getItem(APP_CONFIG.STORAGE_KEYS.BATCHES)) || []
};

// Optional UI refresh callback registered by app.js so the storage layer can
// notify the DOM layer after data changes, without creating a circular import.
let refreshCallback = null;
export function setRefreshCallback(fn) {
  refreshCallback = fn;
}

// --- Supabase client initialization ---
// The Supabase JS v2 UMD bundle is loaded via CDN in index.html and exposes
// the global `supabase` namespace. The client is only created when the SDK is
// present and real (non-placeholder) credentials are configured.
const SUPABASE_URL_PLACEHOLDER = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY_PLACEHOLDER = 'YOUR_SUPABASE_ANON_KEY';

export function isSupabaseConfigured() {
  return Boolean(
    typeof window !== 'undefined' &&
    window.supabase &&
    SUPABASE_URL && SUPABASE_URL !== SUPABASE_URL_PLACEHOLDER &&
    SUPABASE_ANON_KEY && SUPABASE_ANON_KEY !== SUPABASE_KEY_PLACEHOLDER
  );
}

export const supabaseClient = (() => {
  if (!isSupabaseConfigured()) return null;
  try {
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (err) {
    console.warn('Failed to initialize Supabase client:', err);
    return null;
  }
})();

export function getSupabaseClient() {
  return supabaseClient;
}

// Return the live items array.
export function getItems() {
  return db.items;
}

// Return the live PC batches array.
export function getPCBatches() {
  return db.pcBatches;
}

// --- Hybrid local/cloud sync engine (Supabase) ---

// Snapshot of the last persisted items array, used to detect which items were
// mutated locally so `updated_at` is only stamped on real changes.
let lastItemsSnapshot = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.ITEMS) || '[]';

// IDs of locally changed items awaiting a background push to Supabase.
const pendingCloudIds = new Set();

// Last known sync state, surfaced to the UI layer via syncStatusCallback.
let lastSyncInfo = { synced: false, at: null, user: null };
let syncStatusCallback = null;
let pushTimer = null;

export function setSyncStatusCallback(fn) {
  syncStatusCallback = fn;
  notifySyncStatus();
}

export function getSyncStatus() {
  return { ...lastSyncInfo, configured: isSupabaseConfigured() };
}

function notifySyncStatus() {
  if (typeof syncStatusCallback === 'function') {
    syncStatusCallback({ ...lastSyncInfo, configured: isSupabaseConfigured() });
  }
}

// Stamp `updated_at` on items that changed since the last persist and queue
// them for a cloud push. Legacy items without a timestamp get a baseline
// derived from their creation date.
function stampUpdatedItems() {
  let prevById = new Map();
  try {
    const prev = JSON.parse(lastItemsSnapshot) || [];
    prev.forEach(p => { if (p && p.id != null) prevById.set(p.id, JSON.stringify(p)); });
  } catch (e) { /* corrupted snapshot: treat every item as changed */ }

  const nowIso = new Date().toISOString();
  db.items.forEach(item => {
    if (!item || item.id == null) return;
    if (prevById.get(item.id) !== JSON.stringify(item)) {
      item.updated_at = nowIso;
      pendingCloudIds.add(item.id);
    } else if (!item.updated_at) {
      const created = item.createdAt ? new Date(item.createdAt) : null;
      item.updated_at = (created && !isNaN(created.getTime())) ? created.toISOString() : nowIso;
    }
  });
}

// Persist current state to localStorage and notify the UI layer.
export function saveItems() {
  stampUpdatedItems();
  lastItemsSnapshot = JSON.stringify(db.items);
  localStorage.setItem(APP_CONFIG.STORAGE_KEYS.ITEMS, lastItemsSnapshot);
  localStorage.setItem(APP_CONFIG.STORAGE_KEYS.BATCHES, JSON.stringify(db.pcBatches));
  if (typeof refreshCallback === 'function') refreshCallback();
  scheduleCloudPush();
}

// Debounced background push of locally changed items while signed in.
function scheduleCloudPush() {
  if (!supabaseClient || pendingCloudIds.size === 0) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushLocalChangesToCloud().catch(err => console.warn('Background cloud push failed:', err));
  }, 1500);
}

// --- Cloud row (de)serialization ---
// Expected Supabase `items` table schema:
//   id         text        PRIMARY KEY
//   user_id    uuid
//   label      text
//   payload    jsonb       -- the full item object
//   updated_at timestamptz DEFAULT now()
function serializeItemForCloud(item, userId) {
  const updatedAt = item.updated_at || new Date().toISOString();
  return {
    id: item.id,
    user_id: userId,
    label: item.label || '',
    payload: { ...item, updated_at: updatedAt },
    updated_at: updatedAt
  };
}

function deserializeCloudRow(row) {
  const base = (row.payload && typeof row.payload === 'object') ? { ...row.payload } : {};
  base.id = row.id;
  base.updated_at = row.updated_at || base.updated_at || null;
  return base;
}

function itemTimestamp(item) {
  const t = new Date(item.updated_at || item.createdAt || 0).getTime();
  return isNaN(t) ? 0 : t;
}

// Push locally created/updated items to Supabase (requires an active session).
export async function pushLocalChangesToCloud() {
  if (!supabaseClient || pendingCloudIds.size === 0) return false;
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return false;

  const itemsToPush = db.items.filter(i => pendingCloudIds.has(i.id));
  if (!itemsToPush.length) {
    pendingCloudIds.clear();
    return false;
  }

  const rows = itemsToPush.map(item => serializeItemForCloud(item, user.id));
  const { error } = await supabaseClient.from('items').upsert(rows);
  if (error) {
    console.warn('Supabase upsert failed:', error.message);
    return false;
  }

  itemsToPush.forEach(i => pendingCloudIds.delete(i.id));
  lastSyncInfo = { synced: true, at: new Date().toISOString(), user };
  notifySyncStatus();
  return true;
}

// Hybrid sync entry point — run on app load and after auth state changes.
export async function syncItemsWithCloud() {
  // Unconfigured / SDK unavailable: operate smoothly from localStorage.
  if (!supabaseClient) {
    saveItems();
    lastSyncInfo = { synced: false, at: null, user: null };
    notifySyncStatus();
    return { synced: false, reason: isSupabaseConfigured() ? 'sdk-unavailable' : 'unconfigured' };
  }

  try {
    // Check for an active Supabase user session.
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      // Offline / guest user: continue operating from localStorage.
      saveItems();
      lastSyncInfo = { synced: false, at: null, user: null };
      notifySyncStatus();
      return { synced: false, reason: 'guest' };
    }

    // 1) Fetch all items from the Supabase `items` table.
    const { data: cloudRows, error: fetchError } = await supabaseClient.from('items').select('*');
    if (fetchError) throw fetchError;
    const cloudItems = (cloudRows || []).map(deserializeCloudRow);
    const cloudById = new Map(cloudItems.map(ci => [ci.id, ci]));

    // 2) Merge cloud + local items, preferring the latest `updated_at`.
    const merged = new Map();
    cloudItems.forEach(ci => merged.set(ci.id, ci));
    db.items.forEach(li => {
      const ci = cloudById.get(li.id);
      if (!ci || itemTimestamp(li) >= itemTimestamp(ci)) merged.set(li.id, li);
    });

    // 3) Push offline-created / locally newer items back up to Supabase.
    const toUpsert = db.items.filter(li => {
      const ci = cloudById.get(li.id);
      return !ci || itemTimestamp(li) >= itemTimestamp(ci);
    });
    if (toUpsert.length) {
      const rows = toUpsert.map(item => serializeItemForCloud(item, user.id));
      const { error: upsertError } = await supabaseClient.from('items').upsert(rows);
      if (upsertError) throw upsertError;
    }

    // 4) Apply the merged state locally. Pre-align the snapshot so the merge
    //    itself isn't mistaken for a local mutation by stampUpdatedItems().
    db.items = Array.from(merged.values());
    pendingCloudIds.clear();
    lastItemsSnapshot = JSON.stringify(db.items);
    saveItems();

    lastSyncInfo = { synced: true, at: new Date().toISOString(), user };
    notifySyncStatus();
    return { synced: true, user };
  } catch (err) {
    // Network failure / offline: keep operating smoothly from localStorage.
    console.warn('Cloud sync failed; continuing from localStorage.', err);
    saveItems();
    lastSyncInfo = { synced: false, at: null, user: null, error: err };
    notifySyncStatus();
    return { synced: false, reason: 'error', error: err };
  }
}

// Backward-compatible alias (older code referenced syncLocalWithCloud).
export async function syncLocalWithCloud() {
  return syncItemsWithCloud();
}

// --- Auth helpers (Email & Password) ---
export async function getCurrentUser() {
  if (!supabaseClient) return null;
  const { data: { user } } = await supabaseClient.auth.getUser();
  return user || null;
}

export async function signInWithEmail(email, password) {
  if (!supabaseClient) throw new Error('Supabase is not configured.');
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUpWithEmail(email, password) {
  if (!supabaseClient) throw new Error('Supabase is not configured.');
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signOutUser() {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.auth.signOut();
  if (error) console.warn('Sign out error:', error.message);
}

// Google OAuth — redirects to Google and back to this page.
export async function signInWithGoogle() {
  if (!supabaseClient) throw new Error('Supabase is not configured.');
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  if (error) throw error;
}

// Current session (from local storage; no network round-trip).
export async function getSession() {
  if (!supabaseClient) return null;
  const { data } = await supabaseClient.auth.getSession();
  return data ? data.session : null;
}

// Subscribe to auth state changes. Returns an unsubscribe function.
export function onAuthStateChange(cb) {
  if (!supabaseClient) return () => {};
  const { data } = supabaseClient.auth.onAuthStateChange(cb);
  return () => data.subscription.unsubscribe();
}

// Initialize cloud sync: run once on load + re-sync on auth state changes.
export function initCloudSync() {
  syncItemsWithCloud();
  if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        syncItemsWithCloud();
      } else if (event === 'SIGNED_OUT') {
        lastSyncInfo = { synced: false, at: null, user: null };
        notifySyncStatus();
      }
    });
  }
}

// --- Custom container helpers (localStorage) ---
export function getCustomContainers() {
  return JSON.parse(localStorage.getItem(APP_CONFIG.STORAGE_KEYS.CUSTOM_CONTAINERS)) || [];
}

export function addCustomContainer(name) {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const containers = getCustomContainers();
  if (!containers.includes(trimmed)) {
    containers.push(trimmed);
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.CUSTOM_CONTAINERS, JSON.stringify(containers));
    return true;
  }
  return false;
}

// --- Community Feedback & Feature Request storage ---
// Stores feature requests locally and prepares for future Supabase sync.

export function getFeedback() {
  return JSON.parse(localStorage.getItem(APP_CONFIG.STORAGE_KEYS.FEEDBACK)) || [];
}

export function saveFeedback(feedbackList) {
  localStorage.setItem(APP_CONFIG.STORAGE_KEYS.FEEDBACK, JSON.stringify(feedbackList));
  // Future Supabase sync hook:
  // syncFeedbackWithCloud(feedbackList);
}

export function submitFeedback(feedbackObj) {
  const feedbackList = getFeedback();
  const newFeedback = {
    id: 'FB-' + Date.now().toString(36).toUpperCase(),
    title: feedbackObj.title || 'Untitled Feature',
    category: feedbackObj.category || 'UI',
    description: feedbackObj.description || '',
    upvotes: 1,
    status: 'Under Consideration',
    createdAt: new Date().toISOString(),
    synced: false // Flag for future Supabase sync
  };
  feedbackList.unshift(newFeedback);
  saveFeedback(feedbackList);
  return newFeedback;
}

export function upvoteFeature(featureId) {
  const feedbackList = getFeedback();
  const feature = feedbackList.find(f => f.id === featureId);
  if (feature) {
    feature.upvotes = (feature.upvotes || 0) + 1;
    saveFeedback(feedbackList);
    return feature;
  }
  return null;
}

// Placeholder for future Supabase sync of feedback data
export async function syncFeedbackWithCloud() {
  // TODO: Implement Supabase sync when credentials are configured
  // const { SUPABASE } = await import('./config.js');
  // if (!SUPABASE.url || !SUPABASE.anonKey) return;
  // ... sync logic here
  return Promise.resolve(true);
}
