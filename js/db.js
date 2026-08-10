// Storage layer: loads, mutates, and persists Sierra Myco Lab data to localStorage.
// Hybrid local/cloud sync: when Supabase is configured and a user session
// exists, items are merged with the Supabase `items` table (latest
// `updated_at` wins) and offline-created items are pushed back up.
// Offline / guest usage continues seamlessly from localStorage.

import { APP_CONFIG, SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Live mutable application state (single source of truth).
// NOTE: Intentionally NOT hydrated from localStorage. Supabase is the
// authoritative source of truth; local state starts empty and is populated
// by syncItemsWithCloud() after the database query completes. This prevents
// stale or corrupted cached arrays from being rendered before the fetch.
export const db = {
  items: [],
  pcBatches: []
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

// Clear the cached local items (and the change-detection snapshot) so a stale
// localStorage payload never leaks across users or persists after a fetch
// error. Supabase is the single source of truth when signed in, so on logout
// / refresh error we drop the local cache entirely.
export function clearLocalItemsCache() {
  db.items = [];
  pendingCloudIds.clear();
  lastItemsSnapshot = '[]';
  localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.ITEMS);
}

// --- Storage cleanup & cache-busting ---

// Legacy cached item keys that may exist from older app versions. These are
// removed on startup so stale arrays never leak into the new Supabase-first
// data flow.
const LEGACY_STORAGE_KEYS = [
  'items',
  'cached_containers',
  'myco_items',
  'myco_items_v1',
  'myco_items_v2',
  'myco_items_v3',
  'myco_items_v4',
  'myco_batches',
  'myco_batches_v1',
  'myco_batches_v2',
  'myco_batches_v3',
  'myco_batches_v4',
  'pending_import',
  'backup_payload',
  'import_backup',
  'myco_pending_import',
  'myco_backup_payload'
];

// Remove legacy cached item keys from browser storage. Called on app startup
// so stale arrays from previous builds never hydrate or seed local state.
export function clearLegacyStorage() {
  LEGACY_STORAGE_KEYS.forEach(key => {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch (e) { /* storage unavailable: ignore */ }
  });
  // Also remove the current items/batches keys and any pending import payloads so the app always starts
  // empty and waits for the Supabase fetch to populate state.
  localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.ITEMS);
  localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.BATCHES);
  sessionStorage.removeItem(APP_CONFIG.STORAGE_KEYS.ITEMS);
  sessionStorage.removeItem(APP_CONFIG.STORAGE_KEYS.BATCHES);
  clearPendingImportStorage();
}

// Helper to explicitly ensure pending import / backup payload keys are cleared.
export function clearPendingImportStorage() {
  const pendingKeys = ['pending_import', 'backup_payload', 'import_backup', 'myco_pending_import', 'myco_backup_payload'];
  pendingKeys.forEach(key => {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch (e) { /* storage unavailable: ignore */ }
  });
}

// Purge ALL local and session storage. Used on logout so a different account
// (or a guest) never sees the previous user's cached data.
export function purgeAllStorage() {
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch (e) { /* storage unavailable: ignore */ }
  db.items = [];
  db.pcBatches = [];
  pendingCloudIds.clear();
  lastItemsSnapshot = '[]';
}

// Cache-busting / version check. On app launch, if the stored version tag
// does not match the current app version, localStorage is cleared to prevent
// out-of-sync builds across different browsers. The current version tag is
// then written so subsequent launches skip the clear.
export function checkAndClearStaleCache() {
  try {
    const storedVersion = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.VERSION_TAG);
    if (storedVersion !== APP_CONFIG.APP_VERSION) {
      localStorage.clear();
      sessionStorage.clear();
      db.items = [];
      db.pcBatches = [];
      pendingCloudIds.clear();
      lastItemsSnapshot = '[]';
      localStorage.setItem(APP_CONFIG.STORAGE_KEYS.VERSION_TAG, APP_CONFIG.APP_VERSION);
    }
  } catch (e) { /* storage unavailable: ignore */ }
}

// Return the live PC batches array.
export function getPCBatches() {
  return db.pcBatches;
}

// --- Hybrid local/cloud sync engine (Supabase) ---

// Snapshot of the last persisted items array, used to detect which items were
// mutated locally so `updated_at` is only stamped on real changes.
// NOTE: Starts as '[]' (not hydrated from localStorage) so a stale cached
// snapshot can never cause the first save to skip stamping `updated_at`.
let lastItemsSnapshot = '[]';

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
    if (!item) return;
    // Never allow null/empty ids locally: they can never be synced and would
    // violate the items table NOT NULL constraint if ever sent to Supabase.
    if (item.id == null || item.id === '') {
      item.id = generateCloudUuid();
    }
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
//   code            text        -- legacy human-readable code (e.g. "MY-Z9UGC")
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

  // Sanitize the primary key FIRST: never send `id: null`, `id: ""` or a
  // non-UUID placeholder string (e.g. "MY-Z9UGC") to Supabase. Invalid ids
  // are replaced with a client-generated UUID so PostgreSQL always receives
  // a valid value for the NOT NULL `id` column.
  const cloudId = ensureValidCloudId(item);

  // Build a clean payload with only valid Supabase column names.
  // Map legacy field names to Supabase schema:
  // - label -> name
  // - medium -> medium_type
  // - pcBatch -> batch_code
  // - volumeMl -> volume_ml
  const sanitizedItem = {
    id: cloudId,
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

  // Preserve the custom human-readable code (e.g. "MY-Z9UGC") when present.
  // The legacy id may have been the source of this code; once migrated to a
  // real UUID, the code lives in the `code` column for display/search.
  if (item.code) {
    sanitizedItem.code = item.code;
  }

  // Include prep_date if present (used for backdating historical runs)
  if (item.prepDate) {
    sanitizedItem.prep_date = item.prepDate;
  }
  // Include container capacity for PC load calculations
  if (item.containerCapacity != null) {
    sanitizedItem.container_capacity = item.containerCapacity;
  }
  if (item.containerType) {
    sanitizedItem.container_type = item.containerType;
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
    updated_at: row.updated_at || null,
    prepDate: row.prep_date || null,
    prep_date: row.prep_date || null,
    containerCapacity: row.container_capacity != null ? row.container_capacity : null,
    container_capacity: row.container_capacity != null ? row.container_capacity : null,
    containerType: row.container_type || null,
    container_type: row.container_type || null,
    code: row.code || null
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

  // Capture original ids BEFORE serialization: ensureValidCloudId() may
  // replace legacy non-UUID ids with fresh UUIDs, while pendingCloudIds is
  // keyed by the original id.
  const originalIds = itemsToPush.map(i => i.id);
  const rows = itemsToPush.map(item => serializeItemForCloud(item, user.id));
  const { error } = await supabaseClient.from('items').upsert(rows, { onConflict: 'id' });
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

  originalIds.forEach(id => pendingCloudIds.delete(id));
  // Re-persist so the change-detection snapshot matches any items whose ids
  // were upgraded to UUIDs during serialization (prevents re-queueing them
  // as "changed" on the next save).
  lastItemsSnapshot = JSON.stringify(db.items);
  localStorage.setItem(APP_CONFIG.STORAGE_KEYS.ITEMS, lastItemsSnapshot);
  lastSyncInfo = { synced: true, at: new Date().toISOString(), user };
  notifySyncStatus();
  return { success: true };
}

// UUID validation regex - standard UUID format (v1-v5)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Check if an ID is a valid UUID. Invalid string IDs like "MY-Z9UGC"
// must never be sent to Supabase as-is.
function isValidUuid(id) {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

// Generate a valid v4 UUID client-side. Used whenever an item does not have
// a valid UUID so we NEVER send `id: null` / `id: ""` / placeholder ids
// (e.g. "MY-Z9UGC") to Supabase's NOT NULL `id` column.
function generateCloudUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID (RFC4122 v4-ish).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Sanitize an item's id at the cloud boundary.
// - Valid UUID → kept as-is (upserts target the existing cloud row).
// - null / undefined / "" / non-UUID placeholder (e.g. "MY-Z9UGC") →
//   replaced with a fresh client-generated UUID.
// The local item object is mutated so that subsequent pushes upsert the SAME
// cloud row (prevents duplicate inserts) and local state stays consistent
// with the database primary key.
function ensureValidCloudId(item) {
  if (!item) return generateCloudUuid();
  if (item.id == null || item.id === '' || !isValidUuid(item.id)) {
    item.id = generateCloudUuid();
  }
  return item.id;
}

// --- Safe Column Whitelist ---
// Exact list of valid columns currently existing in our Supabase `items` table.
// Any key NOT in this list will be stripped from the payload before insert.
const ALLOWED_COLUMNS = [
  'user_id',
  'code',
  'name',
  'strain',
  'medium_type',
  'batch_code',
  'stage',
  'history',
  'yields',
  'created_at',
  'updated_at',
  'prep_date',
  'container_capacity',
  'container_type'
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
  yields: 'yields',
  // prep date aliases
  prepDate: 'prep_date',
  prep_date: 'prep_date',
  // container capacity aliases
  containerCapacity: 'container_capacity',
  container_capacity: 'container_capacity',
  // container type aliases
  containerType: 'container_type',
  container_type: 'container_type',
  // code aliases (custom human-readable item code, e.g. "MY-Z9UGC")
  code: 'code'
};

// Transform a legacy JSON item into a valid Supabase `items` record.
// SCHEMA-SAFE: Only includes keys present in ALLOWED_COLUMNS.
// BACKWARDS-COMPATIBLE: Maps known legacy key aliases to current column names.
// Strips extra fields like breakAndShake, parentItemId, legacy non-UUID ids, etc.
function transformLegacyItemForSupabase(item, userId) {
  if (!item || typeof item !== 'object') return null;

  // Preserve the legacy custom code (e.g. "MY-Z9UGC") into the `code` column
  // so it isn't lost during import, then omit the `id` key entirely so
  // Supabase auto-generates a fresh UUID primary key for the new row.
  // Prefer an explicit `code`, and only fall back to a legacy non-UUID `id`.
  // Never write a valid UUID into `code` (that would duplicate the key).
  const customCode = item.code || (item.id && !isValidUuid(item.id) ? item.id : null) || null;

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
    code: customCode,
    name: mappedItem.name || '',
    strain: mappedItem.strain || '',
    medium_type: mappedItem.medium_type || '',
    batch_code: mappedItem.batch_code || '',
    stage: mappedItem.stage || 'Preparation',
    history: Array.isArray(mappedItem.history) ? mappedItem.history : [],
    yields: Array.isArray(mappedItem.yields) ? mappedItem.yields : [],
    created_at: mappedItem.created_at || new Date().toISOString(),
    updated_at: mappedItem.updated_at || new Date().toISOString(),
    prep_date: mappedItem.prep_date || null,
    container_capacity: mappedItem.container_capacity != null ? mappedItem.container_capacity : null,
    container_type: mappedItem.container_type || null
  };

  // Step 3: Final whitelist filter - ensure ONLY ALLOWED_COLUMNS are present.
  // This is a safety net in case any unexpected keys slipped through.
  const sanitizedItem = {};
  for (const column of ALLOWED_COLUMNS) {
    if (cleanedItem[column] !== undefined) {
      sanitizedItem[column] = cleanedItem[column];
    }
  }

  // Step 4: Include the `id` if it's a valid UUID so UPSERT can match existing
  // records. For legacy non-UUID ids (e.g. "MY-Z9UGC"), omit the id so Supabase
  // auto-generates a valid UUID, while the legacy code is preserved in `code`.
  if (item.id && isValidUuid(item.id)) {
    sanitizedItem.id = item.id;
  }
  return sanitizedItem;
}

// Batch-upload items to the Supabase `items` table under the currently
// authenticated user (used by the JSON backup import/restore flow).
// 1) Fetches the current user via supabase.auth.getUser().
// 2) Sanitizes each legacy item before insert:
//    - Preserves the legacy custom code (e.g. "MY-Z9UGC") into `code`
//    - Omits the `id` key so Supabase auto-generates a valid UUID primary key
//    - Maps `label` -> `name`, `medium` -> `medium_type`
//    - Attaches `user_id` from the active session
// 3) Executes a single batch `supabase.from('items').insert(...)`.
// 4) Exposes full Supabase error details for debugging.
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

  // 2) Sanitize each item before insert:
  //    - Preserves the legacy custom code into the `code` column
  //    - Omits the `id` key so Supabase auto-generates a fresh UUID
  //    - Attaches user_id from the active session
  const formattedItems = items
    .map(item => transformLegacyItemForSupabase(item, user.id))
    .filter(item => item != null);

  if (!formattedItems.length) {
    return { success: false, error: new Error('No valid items found in the backup.') };
  }

  // 3) Execute a SINGLE batch UPSERT. If a record with matching `id`
  //    already exists, it will be updated. Otherwise, a new record is inserted.
  //    The import is capped at 100 items (see app.js MAX_IMPORT_ITEMS), so this
  //    is well within PostgREST payload limits.
  const { data, error } = await supabaseClient.from('items').upsert(formattedItems, { 
    onConflict: 'id',
    ignoreDuplicates: false 
  });
  
  if (error) {
    // Expose full Supabase error details for debugging
    console.error('Supabase backup upsert failed:', {
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
      insertedCount: 0
    };
  }

  // Count how many were inserted vs updated
  const totalProcessed = formattedItems.length;
  
  // Query existing records to determine insert vs update count
  // Since we upsert on 'id', check which items already exist by their IDs
  const existingIds = formattedItems
    .filter(item => item.id)
    .map(item => item.id);
  
  let insertedCount = totalProcessed;
  let updatedCount = 0;
  
  if (existingIds.length > 0) {
    const { data: existingRows } = await supabaseClient
      .from('items')
      .select('id')
      .eq('user_id', user.id)
      .in('id', existingIds);
    
    const existingIdSet = new Set((existingRows || []).map(row => row.id));
    const updateCount = formattedItems.filter(item => item.id && existingIdSet.has(item.id)).length;
    
    updatedCount = updateCount;
    insertedCount = totalProcessed - updateCount;
  }
  
  console.log(`Backup import completed: ${insertedCount} inserted, ${updatedCount} updated`);

  lastSyncInfo = { synced: true, at: new Date().toISOString(), user };
  notifySyncStatus();
  return { success: true, user, insertedCount: totalProcessed, updatedCount };
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

  // Cancel any pending background pushes for the items being deleted.
  itemIds.forEach(id => pendingCloudIds.delete(id));

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

// Fetch-only sync entry point — run on app load and after auth state changes.
// When Supabase is configured and a user is signed in, Supabase is the single
// source of truth: items are fetched (filtered by user_id) and REPLACE local
// state. This function NEVER pushes/upserts local state, so a page refresh
// cannot create duplicate cloud rows or violate the NOT NULL `id` constraint.
// Local changes are pushed separately via scheduleCloudPush() after explicit
// user actions (saveItems).
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

    // 1) FETCH ONLY — supabase.from('items').select('*') filtered by user.
    //    IMPORTANT: do NOT push/upsert local state during page mount/fetch.
    const { data: cloudRows, error: fetchError } = await supabaseClient
      .from('items')
      .select('*')
      .eq('user_id', user.id);
    if (fetchError) throw fetchError;
    // Deserialize and filter out any null results
    const cloudItems = (cloudRows || [])
      .map(deserializeCloudRow)
      .filter(item => item != null);

    // 2) REPLACE local state with the fetched data (never append/merge).
    db.items = cloudItems;
    pendingCloudIds.clear();
    
    // 3) Persist locally & align the change-detection snapshot so this fetch
    //    isn't mistaken for a local mutation by stampUpdatedItems(). Persist
    //    directly (instead of saveItems()) so the fetch itself can never
    //    schedule a cloud push.
    lastItemsSnapshot = JSON.stringify(db.items);
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.ITEMS, lastItemsSnapshot);
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.BATCHES, JSON.stringify(db.pcBatches));
    if (typeof refreshCallback === 'function') refreshCallback();

    lastSyncInfo = { synced: true, at: new Date().toISOString(), user };
    notifySyncStatus();
    return { synced: true, user, itemCount: cloudItems.length };
  } catch (err) {
    // Fetch error (network / auth / server): clear the stale local cache so
    // the UI never renders outdated items that are out of sync with Supabase.
    // No saveItems() here — a failed fetch must never trigger a push.
    notifySyncError(err, 'sync');
    clearLocalItemsCache();
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
  // Purge ALL local and session storage so a different account (or a guest)
  // never sees the previous user's cached data. Supabase remains the source
  // of truth and will re-populate state on the next sign-in.
  purgeAllStorage();
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

// Initialize cloud sync: fetch once on load + re-fetch on auth state changes.
// syncItemsWithCloud() is fetch-only, so this never auto-pushes local state.
// (TOKEN_REFRESHED is intentionally ignored — it fired hourly re-fetches and,
// with the old code, caused duplicate pushes on every refresh.)
export function initCloudSync() {
  syncItemsWithCloud();
  if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        syncItemsWithCloud();
      } else if (event === 'SIGNED_OUT') {
        // Purge ALL local and session storage so a different account or guest
        // session never sees the previous user's cached data.
        purgeAllStorage();
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

// --- Custom presets (containers & mediums) ---
// Custom presets are stored as structured objects with metadata (type, capacity,
// recommended medium) so they can be used for smart filtering and PC load
// calculations. Persisted to localStorage and optionally synced to Supabase
// under user.app_metadata / public.custom_presets.

// Get all custom presets (containers + mediums)
export function getCustomPresets() {
  return JSON.parse(localStorage.getItem(APP_CONFIG.STORAGE_KEYS.CUSTOM_PRESETS)) || { containers: [], mediums: [] };
}

// Get custom container presets
export function getCustomContainerPresets() {
  return getCustomPresets().containers || [];
}

// Get custom medium presets
export function getCustomMediumPresets() {
  return getCustomPresets().mediums || [];
}

// Save a custom container preset
// preset: { name, type, capacityValue, capacityUnit, recommendedMedium }
export function addCustomContainerPreset(preset) {
  if (!preset || !preset.name || !preset.name.trim()) return false;
  const presets = getCustomPresets();
  const name = preset.name.trim();
  // Avoid duplicates by name
  if (presets.containers.some(c => c.name.toLowerCase() === name.toLowerCase())) return false;
  
  const newPreset = {
    id: 'CC-' + Date.now().toString(36).toUpperCase(),
    name,
    type: preset.type || 'Other',
    capacityValue: parseFloat(preset.capacityValue) || 0,
    capacityUnit: preset.capacityUnit || 'ml',
    recommendedMedium: preset.recommendedMedium || 'All',
    createdAt: new Date().toISOString()
  };
  
  presets.containers.push(newPreset);
  localStorage.setItem(APP_CONFIG.STORAGE_KEYS.CUSTOM_PRESETS, JSON.stringify(presets));
  
  // Also add to legacy custom containers list for backwards compatibility
  addCustomContainer(name);
  
  // Attempt to sync to Supabase (non-blocking)
  syncCustomPresetsToCloud();
  
  return newPreset;
}

// Save a custom medium preset
// preset: { name, category }
export function addCustomMediumPreset(preset) {
  if (!preset || !preset.name || !preset.name.trim()) return false;
  const presets = getCustomPresets();
  const name = preset.name.trim();
  // Avoid duplicates by name
  if (presets.mediums.some(m => m.name.toLowerCase() === name.toLowerCase())) return false;
  
  const newPreset = {
    id: 'CM-' + Date.now().toString(36).toUpperCase(),
    name,
    category: preset.category || 'GRAIN',
    createdAt: new Date().toISOString()
  };
  
  presets.mediums.push(newPreset);
  localStorage.setItem(APP_CONFIG.STORAGE_KEYS.CUSTOM_PRESETS, JSON.stringify(presets));
  
  // Attempt to sync to Supabase (non-blocking)
  syncCustomPresetsToCloud();
  
  return newPreset;
}

// Delete a custom container preset by id
export function deleteCustomContainerPreset(id) {
  const presets = getCustomPresets();
  const before = presets.containers.length;
  presets.containers = presets.containers.filter(c => c.id !== id);
  if (presets.containers.length !== before) {
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.CUSTOM_PRESETS, JSON.stringify(presets));
    syncCustomPresetsToCloud();
    return true;
  }
  return false;
}

// Delete a custom medium preset by id
export function deleteCustomMediumPreset(id) {
  const presets = getCustomPresets();
  const before = presets.mediums.length;
  presets.mediums = presets.mediums.filter(m => m.id !== id);
  if (presets.mediums.length !== before) {
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.CUSTOM_PRESETS, JSON.stringify(presets));
    syncCustomPresetsToCloud();
    return true;
  }
  return false;
}

// Sync custom presets to Supabase (non-blocking, best-effort).
// Stores under user.app_metadata.custom_presets when signed in.
export async function syncCustomPresetsToCloud() {
  if (!supabaseClient) return;
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    
    const presets = getCustomPresets();
    const { error } = await supabaseClient.auth.updateUser({
      data: { custom_presets: presets }
    });
    if (error) console.warn('Failed to sync custom presets to cloud:', error.message);
  } catch (err) {
    console.warn('Custom preset cloud sync failed:', err);
  }
}

// Load custom presets from Supabase user metadata (called on app init)
export async function loadCustomPresetsFromCloud() {
  if (!supabaseClient) return;
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    
    const metaPresets = user.user_metadata?.custom_presets;
    if (metaPresets && (metaPresets.containers || metaPresets.mediums)) {
      localStorage.setItem(APP_CONFIG.STORAGE_KEYS.CUSTOM_PRESETS, JSON.stringify(metaPresets));
    }
  } catch (err) {
    console.warn('Failed to load custom presets from cloud:', err);
  }
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
  free: 100,
  grower: 500,
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

// Fetch the user's plan + container limit for the usage badge.
// Source priority (fresh, never cached):
//   1) public.profiles  → `plan`, `container_limit`, `role`
//                         (falls back to `subscription_tier` for `plan`)
//   2) user.app_metadata  — set server-side (admin panel / webhooks / SQL
//                           updates via the service role)
//   3) user.user_metadata — client-settable metadata
// Returns { plan: string, containerLimit: number|null, role: string|null }
// or null when Supabase is unavailable / the user is signed out.
export async function getProfilePlanInfo() {
  if (!supabaseClient) return null;
  try {
    // auth.getUser() always hits the GoTrue server (no stale local cache),
    // so app_metadata changes made in the database are picked up immediately.
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return null;

    let plan = null;
    let containerLimit = null;
    let role = null;

    // 1) public.profiles — direct read of the plan columns.
    let profile = null;
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('plan, container_limit, role, subscription_tier')
      .eq('id', user.id)
      .maybeSingle();
    if (!error && data) {
      profile = data;
    } else if (error) {
      // The explicit columns may not exist on older schemas — retry with a
      // tolerant select('*') so the lookup never hard-fails.
      console.warn('profiles plan lookup failed, retrying with select(*):', error.message);
      const fallback = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      if (!fallback.error && fallback.data) profile = fallback.data;
    }

    if (profile) {
      plan = profile.plan || profile.subscription_tier || null;
      role = profile.role || null;
      if (profile.container_limit != null && !isNaN(Number(profile.container_limit))) {
        containerLimit = Number(profile.container_limit);
      }
    }

    // 2) Fallback: auth user metadata. app_metadata wins — it is where
    //    server-side/admin plan changes are stored; user_metadata is the
    //    client-settable counterpart.
    const appMeta = user.app_metadata || {};
    const userMeta = user.user_metadata || {};
    if (!plan) {
      plan = appMeta.plan || appMeta.subscription_tier ||
             userMeta.plan || userMeta.subscription_tier || null;
    }
    if (!role) role = appMeta.role || userMeta.role || null;
    if (containerLimit == null) {
      const metaLimit = appMeta.container_limit != null
        ? appMeta.container_limit
        : userMeta.container_limit;
      if (metaLimit != null && !isNaN(Number(metaLimit))) {
        containerLimit = Number(metaLimit);
      }
    }

    return {
      plan: String(plan || 'free').toLowerCase(),
      containerLimit,
      role: role ? String(role).toLowerCase() : null
    };
  } catch (err) {
    console.warn('Error fetching profile plan info:', err);
    return null;
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
  const [usage, planInfo] = await Promise.all([
    getContainerUsage(),
    getProfilePlanInfo()
  ]);

  // Plan: profiles.plan / user metadata wins over the RPC tier.
  const tier = (planInfo && planInfo.plan) || (usage && usage.tier) || 'free';
  const isAdminRole = (planInfo && planInfo.role) === 'admin';
  const isProTier = tier === 'pro' || tier === 'admin' || isAdminRole;

  // Limit: profiles.container_limit wins; PRO/admin default to unlimited.
  let maxLimit;
  if (planInfo && planInfo.containerLimit != null) {
    maxLimit = planInfo.containerLimit;
  } else if (isProTier) {
    maxLimit = 999999; // unlimited
  } else {
    maxLimit = (usage && usage.max_limit != null) ? usage.max_limit : TIER_LIMITS.free;
  }
  
  if (!usage) {
    // Fallback for offline/guest mode
    const localCount = getLocalActiveContainerCount();
    return {
      active_count: localCount,
      max_limit: maxLimit,
      can_create: localCount < maxLimit,
      tier,
      subscription_status: 'none',
      lemonsqueezy_subscription_id: null,
      lemonsqueezy_customer_portal_url: null,
      subscription_current_period_end: null
    };
  }
  
  return { ...usage, tier, max_limit: maxLimit, can_create: (usage.active_count || 0) < maxLimit };
}
