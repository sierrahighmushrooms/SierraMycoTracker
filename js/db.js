// Storage layer: loads, mutates, and persists Sierra Myco Lab data to localStorage.
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
  pushTimer = setTimeout(async () => {
    try {
      const result = await pushLocalChangesToCloud();
      // If a container limit error occurred, notify the UI layer
      if (result && result.limitError) {
        // Dispatch a custom event that the UI layer can listen for
        window.dispatchEvent(new CustomEvent('container-limit-error', { 
          detail: { error: result.error } 
        }));
      }
    } catch (err) {
      console.warn('Background cloud push failed:', err);
    }
  }, 1500);
}

// --- Cloud row (de)serialization ---
// Expected Supabase `items` table schema (strict column names):
//   id              uuid        PRIMARY KEY (auto-generated)
//   user_id         uuid
//   name            text        -- mapped from item.label
//   medium_type     text        -- mapped from item.medium
//   batch_code      text        -- mapped from item.pcBatch
//   stage           text
//   strain          text
//   history         jsonb
//   yields          jsonb
//   created_at      timestamptz
//   updated_at      timestamptz DEFAULT now()
// NOTE: The 'label' column does NOT exist - must use 'name' instead.
function serializeItemForCloud(item, userId) {
  const updatedAt = item.updated_at || new Date().toISOString();
  const createdAt = item.createdAt || item.created_at || new Date().toISOString();
  
  // Build a clean payload with only valid Supabase column names.
  // Map legacy field names to Supabase schema:
  // - label -> name
  // - medium -> medium_type
  // - pcBatch -> batch_code
  // - volumeMl -> volume_ml
  const sanitizedItem = {
    user_id: userId,
    name: item.label || item.name || '',
    strain: item.strain || '',
    medium_type: item.medium || item.medium_type || '',
    batch_code: item.pcBatch || item.batch_code || '',
    stage: item.stage || 'Preparation',
    history: Array.isArray(item.history) ? item.history : [],
    yields: Array.isArray(item.yields) ? item.yields : [],
    created_at: createdAt,
    updated_at: updatedAt
  };

  // Only include id if it's a valid UUID (for upsert operations)
  if (isValidUuid(item.id)) {
    sanitizedItem.id = item.id;
  }

  return sanitizedItem;
}

// Deserialize a Supabase row back to the local app item format.
// Database-to-UI Mapping: maps Supabase column names back to frontend item structure.
// Includes both legacy field names AND database column names with fallbacks
// to ensure the UI never renders 'undefined' values.
function deserializeCloudRow(row) {
  if (!row || typeof row !== 'object') return null;
  
  // Map database columns to frontend item structure with comprehensive fallbacks
  const itemName = row.name || row.label || 'Unnamed Item';
  const itemMedium = row.medium_type || row.medium || '';
  const itemBatch = row.batch_code || row.batch || row.pcBatch || '';
  
  return {
    id: row.id,
    user_id: row.user_id,
    // Provide both legacy and new field names for maximum compatibility
    label: itemName,
    name: itemName,
    strain: row.strain || '',
    medium: itemMedium,
    medium_type: itemMedium,
    pcBatch: itemBatch,
    batch_code: row.batch_code || '',
    stage: row.stage || 'Preparation',
    history: Array.isArray(row.history) ? row.history : [],
    yields: Array.isArray(row.yields) ? row.yields : [],
    createdAt: row.created_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
}

function itemTimestamp(item) {
  const t = new Date(item.updated_at || item.createdAt || 0).getTime();
  return isNaN(t) ? 0 : t;
}

// Push locally created/updated items to Supabase (requires an active session).
// Returns { success: boolean, limitError?: boolean } to indicate sync status.
export async function pushLocalChangesToCloud() {
  if (!supabaseClient || pendingCloudIds.size === 0) return { success: false };
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return { success: false };

  const itemsToPush = db.items.filter(i => pendingCloudIds.has(i.id));
  if (!itemsToPush.length) {
    pendingCloudIds.clear();
    return { success: false };
  }

  const rows = itemsToPush.map(item => serializeItemForCloud(item, user.id));
  const { error } = await supabaseClient.from('items').upsert(rows);
  if (error) {
    console.warn('Supabase upsert failed:', error.message);
    // Check if this is a container limit error from the trigger
    if (isContainerLimitError(error)) {
      lastSyncInfo = { synced: false, at: null, user, limitError: true, error };
      notifySyncStatus();
      return { success: false, limitError: true, error };
    }
    return { success: false, error };
  }

  itemsToPush.forEach(i => pendingCloudIds.delete(i.id));
  lastSyncInfo = { synced: true, at: new Date().toISOString(), user };
  notifySyncStatus();
  return { success: true };
}

// UUID validation regex - standard UUID format (v1-v5)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Check if an ID is a valid UUID. Invalid string IDs like "MY-Z9UGC" 
// should be deleted so Supabase can auto-generate proper UUIDs.
function isValidUuid(id) {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

// --- Safe Column Whitelist ---
// Exact list of valid columns currently existing in our Supabase `items` table.
// Any key NOT in this list will be stripped from the payload before insert.
const ALLOWED_COLUMNS = [
  'user_id',
  'name',
  'strain',
  'medium_type',
  'batch_code',
  'stage',
  'history',
  'yields',
  'created_at',
  'updated_at'
];

// --- Defensive Key Mapping ---
// Maps known legacy key aliases to their Supabase column names.
// This ensures backwards-compatibility with older JSON export formats.
const KEY_ALIASES = {
  // name aliases
  label: 'name',
  name: 'name',
  // medium_type aliases
  medium: 'medium_type',
  medium_type: 'medium_type',
  // batch_code aliases
  pcBatch: 'batch_code',
  batch_code: 'batch_code',
  // created_at aliases
  createdAt: 'created_at',
  created_at: 'created_at',
  // updated_at aliases
  updatedAt: 'updated_at',
  updated_at: 'updated_at',
  // direct mappings (no alias needed)
  strain: 'strain',
  stage: 'stage',
  history: 'history',
  yields: 'yields'
};

// Transform a legacy JSON item into a valid Supabase `items` record.
// SCHEMA-SAFE: Only includes keys present in ALLOWED_COLUMNS.
// BACKWARDS-COMPATIBLE: Maps known legacy key aliases to current column names.
// Strips extra fields like breakAndShake, parentItemId, legacy non-UUID ids, etc.
function transformLegacyItemForSupabase(item, userId) {
  if (!item || typeof item !== 'object') return null;

  const originalId = item.id || null;

  // Determine if the original ID is valid. Invalid string IDs (like "MY-Z9UGC")
  // are deleted so Supabase can auto-generate a proper database UUID.
  const hasValidUuid = isValidUuid(originalId);

  // Step 1: Defensive mapping - iterate over incoming item keys and map
  // known legacy aliases to their Supabase column names.
  const mappedItem = {};
  for (const [key, value] of Object.entries(item)) {
    const targetColumn = KEY_ALIASES[key];
    if (targetColumn && ALLOWED_COLUMNS.includes(targetColumn)) {
      // Only set if not already set (first alias wins)
      if (mappedItem[targetColumn] === undefined) {
        mappedItem[targetColumn] = value;
      }
    }
    // Keys not in KEY_ALIASES are stripped (breakAndShake, parentItemId, etc.)
  }

  // Step 2: Build the clean payload with defaults for missing fields.
  const cleanedItem = {
    user_id: userId,
    name: mappedItem.name || '',
    strain: mappedItem.strain || '',
    medium_type: mappedItem.medium_type || '',
    batch_code: mappedItem.batch_code || '',
    stage: mappedItem.stage || 'Preparation',
    history: Array.isArray(mappedItem.history) ? mappedItem.history : [],
    yields: Array.isArray(mappedItem.yields) ? mappedItem.yields : [],
    created_at: mappedItem.created_at || new Date().toISOString(),
    updated_at: mappedItem.updated_at || new Date().toISOString()
  };

  // Step 3: Final whitelist filter - ensure ONLY ALLOWED_COLUMNS are present.
  // This is a safety net in case any unexpected keys slipped through.
  const sanitizedItem = {};
  for (const column of ALLOWED_COLUMNS) {
    if (cleanedItem[column] !== undefined) {
      sanitizedItem[column] = cleanedItem[column];
    }
  }

  // Step 4: Only include the id field if it's a valid UUID.
  // Invalid string IDs (like "MY-Z9UGC") are deleted so Supabase
  // can auto-generate valid UUIDs.
  if (hasValidUuid) {
    sanitizedItem.id = originalId;
  }
  // If hasValidUuid is false, the id key is intentionally omitted so
  // Supabase auto-generates a proper database UUID for the primary key.

  return sanitizedItem;
}

// Batch-upload items to the Supabase `items` table under the currently
// authenticated user (used by the JSON backup import/restore flow).
// 1) Fetches the current user via supabase.auth.getUser().
// 2) Transforms each legacy item to match the Supabase schema:
//    - Maps `label` -> `name`
//    - Maps `medium` -> `medium_type`
//    - Deletes invalid string IDs (like "MY-Z9UGC") so Supabase auto-generates UUIDs
//    - Attaches `user_id` from the active session
// 3) Stores original custom IDs in item_code for reference.
// 4) Performs a batched `supabase.from('items').insert(...)`.
// 5) Exposes full Supabase error details for debugging.
// Returns { success: boolean, user?, error?, limitError?, insertedCount? }.
export async function uploadItemsToCloud(items) {
  if (!supabaseClient) {
    return { success: false, error: new Error('Supabase is not configured.') };
  }

  // 1) Fetch the logged-in user's UUID from the active session.
  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !user) {
    return { success: false, error: new Error('You must be signed in to sync your backup to the cloud.') };
  }

  if (!Array.isArray(items) || items.length === 0) {
    return { success: true, user, insertedCount: 0 };
  }

  // 2) Clean & map each item in the items array to a valid Supabase record.
  //    - Maps label -> name, medium -> medium_type
  //    - Deletes invalid string IDs so Supabase can auto-generate valid UUIDs
  //    - Attaches user_id from the active session
  const formattedItems = items
    .map(item => transformLegacyItemForSupabase(item, user.id))
    .filter(item => item != null);

  if (!formattedItems.length) {
    return { success: false, error: new Error('No valid items found in the backup.') };
  }

  // 3) Execute the insert in chunks to stay under PostgREST payload limits.
  //    const { data, error } = await supabase.from('items').insert(formattedItems);
  const CHUNK_SIZE = 500;
  let totalInserted = 0;

  for (let i = 0; i < formattedItems.length; i += CHUNK_SIZE) {
    const chunk = formattedItems.slice(i, i + CHUNK_SIZE);
    const { data, error } = await supabaseClient.from('items').insert(chunk);
    
    if (error) {
      // Expose full Supabase error details for debugging
      console.error('Supabase backup insert failed:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      return { 
        success: false, 
        error, 
        errorMessage: error.message,
        errorDetails: error.details,
        errorHint: error.hint,
        errorCode: error.code,
        limitError: isContainerLimitError(error), 
        insertedCount: totalInserted 
      };
    }
    
    totalInserted += chunk.length;
  }

  lastSyncInfo = { synced: true, at: new Date().toISOString(), user };
  notifySyncStatus();
  return { success: true, user, insertedCount: totalInserted };
}

// Delete items from Supabase by their IDs for the authenticated user.
// Returns { success: boolean, error? }.
export async function deleteItemsFromCloud(itemIds) {
  if (!supabaseClient) {
    return { success: false, error: new Error('Supabase is not configured.') };
  }

  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return { success: true }; // Nothing to delete
  }

  const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !user) {
    return { success: false, error: new Error('Not authenticated.') };
  }

  const { error } = await supabaseClient
    .from('items')
    .delete()
    .eq('user_id', user.id)
    .in('id', itemIds);

  if (error) {
    console.error('Supabase delete failed:', error.message);
    return { success: false, error };
  }

  return { success: true };
}

// Error callback for displaying sync errors as toasts in the UI layer.
let syncErrorCallback = null;
export function setSyncErrorCallback(fn) {
  syncErrorCallback = fn;
}

function notifySyncError(error, context = 'sync') {
  console.warn(`Cloud ${context} failed:`, error);
  if (typeof syncErrorCallback === 'function') {
    syncErrorCallback(error, context);
  }
}

// Hybrid sync entry point — run on app load and after auth state changes.
// When Supabase is configured and user is signed in, Supabase is the single
// source of truth: items are fetched filtered by user_id and replace local state.
export async function syncItemsWithCloud() {
  // Unconfigured / SDK unavailable: operate smoothly from localStorage.
  if (!supabaseClient) {
    saveItems();
    lastSyncInfo = { synced: false, at: null, user: null };
    notifySyncStatus();
    return { synced: false, reason: isSupabaseConfigured() ? 'sdk-unavailable' : 'unconfigured' };
  }

  try {
    // Session awareness: wait for auth to be fully initialized before fetching.
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      // Guest user: continue operating from localStorage only.
      saveItems();
      lastSyncInfo = { synced: false, at: null, user: null };
      notifySyncStatus();
      return { synced: false, reason: 'guest' };
    }

    // 1) Fetch items from Supabase filtered by the authenticated user's id.
    //    Supabase is the single source of truth when signed in.
    const { data: cloudRows, error: fetchError } = await supabaseClient
      .from('items')
      .select('*')
      .eq('user_id', user.id);
    if (fetchError) throw fetchError;
    // Deserialize and filter out any null results
    const cloudItems = (cloudRows || [])
      .map(deserializeCloudRow)
      .filter(item => item != null);
    const cloudById = new Map(cloudItems.map(ci => [ci.id, ci]));

    // 2) Identify local-only items that need to be pushed up (offline-created).
    //    These are items that exist locally but not in the cloud yet.
    const localOnlyItems = db.items.filter(li => !cloudById.has(li.id));
    
    // 3) Push offline-created items to Supabase so they're not lost.
    if (localOnlyItems.length) {
      const rows = localOnlyItems.map(item => serializeItemForCloud(item, user.id));
      const { error: upsertError } = await supabaseClient.from('items').upsert(rows, { onConflict: 'id' });
      if (upsertError) throw upsertError;
    }

    // 4) Supabase is the source of truth: replace local state with cloud data,
    //    plus any local-only items we just pushed. Pre-align the snapshot so
    //    this isn't mistaken for a local mutation by stampUpdatedItems().
    const mergedItems = [...cloudItems, ...localOnlyItems];
    db.items = mergedItems;
    pendingCloudIds.clear();
    lastItemsSnapshot = JSON.stringify(db.items);
    saveItems();

    lastSyncInfo = { synced: true, at: new Date().toISOString(), user };
    notifySyncStatus();
    return { synced: true, user, itemCount: mergedItems.length };
  } catch (err) {
    // Network failure / offline: keep operating from localStorage but notify UI.
    notifySyncError(err, 'sync');
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

// --- Subscription Tier & Container Limit Helpers ---

// Tier limits for local/offline checks (mirrors database subscription_tiers table)
export const TIER_LIMITS = {
  free: 15,
  grower: 100,
  commercial: 999999
};

// Stages that are considered inactive (terminal states)
export const INACTIVE_STAGES = ['Archived', 'Spent', 'Contaminated'];

// Check if a stage is considered active
export function isActiveStage(stage) {
  return !INACTIVE_STAGES.includes(stage);
}

// Get local active container count (for offline/guest mode)
export function getLocalActiveContainerCount() {
  return db.items.filter(item => isActiveStage(item.stage || 'Preparation')).length;
}

// Fetch container usage from Supabase RPC
// Returns: { active_count, max_limit, can_create, tier } or null if unavailable
export async function getContainerUsage() {
  if (!supabaseClient) return null;
  
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return null;
    
    const { data, error } = await supabaseClient.rpc('get_container_usage', {
      user_uuid: user.id
    });
    
    if (error) {
      console.warn('Failed to fetch container usage:', error.message);
      return null;
    }
    
    // RPC returns an array, get first row
    if (data && data.length > 0) {
      return data[0];
    }
    return null;
  } catch (err) {
    console.warn('Error fetching container usage:', err);
    return null;
  }
}

// Get user's subscription tier from Supabase profile
export async function getSubscriptionTier() {
  if (!supabaseClient) return 'free';
  
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return 'free';
    
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('subscription_tier')
      .eq('id', user.id)
      .single();
    
    if (error || !data) return 'free';
    return data.subscription_tier || 'free';
  } catch (err) {
    console.warn('Error fetching subscription tier:', err);
    return 'free';
  }
}

// Check if user can create more containers (local check for immediate feedback)
export function canCreateContainerLocal() {
  const activeCount = getLocalActiveContainerCount();
  // For local/offline mode, we use free tier limit as default
  // The actual enforcement happens server-side via the trigger
  return {
    canCreate: true, // Always allow locally, server will enforce
    activeCount,
    limit: TIER_LIMITS.free
  };
}

// Check if an error is a container limit error
export function isContainerLimitError(error) {
  if (!error) return false;
  const message = error.message || '';
  return message.includes('Active container limit reached') ||
         message.includes('container limit') ||
         message.includes('Upgrade to add more containers');
}

// --- Billing & Subscription Helpers ---

// API endpoint for Lemon Squeezy checkout creation
// This should point to your Supabase Edge Function or backend API
export const LEMON_SQUEEZY_CHECKOUT_ENDPOINT = '/api/lemonsqueezy/create-checkout';

// Fetch subscription tiers from Supabase RPC
// Returns: [{ tier_name, display_name, max_active_containers, monthly_price_cents, lemonsqueezy_variant_id }]
export async function getSubscriptionTiers() {
  if (!supabaseClient) return null;
  
  try {
    const { data, error } = await supabaseClient.rpc('get_subscription_tiers');
    
    if (error) {
      console.warn('Failed to fetch subscription tiers:', error.message);
      return null;
    }
    
    return data || [];
  } catch (err) {
    console.warn('Error fetching subscription tiers:', err);
    return null;
  }
}

// Create a Lemon Squeezy checkout session for a tier upgrade
// Returns: { checkout_url } or { error }
export async function createLemonSqueezyCheckout(tierName, variantId) {
  if (!supabaseClient) {
    return { error: 'Supabase is not configured.' };
  }
  
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return { error: 'You must be signed in to upgrade.' };
    }
    
    // Get the current session for the auth token
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    const response = await fetch(LEMON_SQUEEZY_CHECKOUT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`
      },
      body: JSON.stringify({
        tier: tierName,
        variant_id: variantId,
        user_id: user.id,
        user_email: user.email
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { error: errorData.error || `Checkout creation failed (${response.status})` };
    }
    
    const data = await response.json();
    return { checkout_url: data.checkout_url || data.url };
  } catch (err) {
    console.warn('Error creating checkout:', err);
    return { error: err.message || 'Failed to create checkout session.' };
  }
}

// Get full billing info for the settings page
// Combines container usage with subscription details
export async function getBillingInfo() {
  const usage = await getContainerUsage();
  
  if (!usage) {
    // Fallback for offline/guest mode
    const localCount = getLocalActiveContainerCount();
    return {
      active_count: localCount,
      max_limit: TIER_LIMITS.free,
      can_create: localCount < TIER_LIMITS.free,
      tier: 'free',
      subscription_status: 'none',
      lemonsqueezy_subscription_id: null,
      lemonsqueezy_customer_portal_url: null,
      subscription_current_period_end: null
    };
  }
  
  return usage;
}
