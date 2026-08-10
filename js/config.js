// Global constants and application configuration for Sierra Myco Lab.

// Canonical lifecycle stages / workflows
export const STAGES = ['Preparation', 'Inoculated', 'Colonizing', 'Fully Colonized', 'Ready to Use', 'Fruiting', 'Archived', 'Spent', 'Contaminated'];

// Stage sets per container type (used for the "Advance Stage" dropdown)
export const CONTAINER_STAGES = {
  'Agar Dish / Slant': ['Preparation', 'Colonizing', 'Fully Colonized', 'Archived'],
  'Liquid Culture Jar': ['Preparation', 'Colonizing', 'Ready to Use', 'Spent'],
  'Grain Jar / Bag': ['Preparation', 'Colonizing', 'Fully Colonized', 'Spent'],
  'Fruiting Block / Monotub': ['Inoculated', 'Colonizing', 'Fruiting', 'Spent']
};

// Type-specific stage sets for the "Advance Stage" dropdown based on medium type
export const SUBSTRATE_STAGES = ['Preparation', 'Colonizing', 'Pins / Primordia', 'Fruiting', 'Harvesting', 'Spent', 'Contaminated'];
export const GRAIN_STAGES = ['Preparation', 'Inoculated', 'Colonizing', 'Ready', 'Spent', 'Contaminated'];

// --- Medium & Container Categorization (Smart Filtering) ---

// Medium categories with their display names and canonical values
export const MEDIUM_CATEGORIES = {
  GRAIN: {
    label: 'Grain',
    icon: '🌾',
    items: [
      { name: 'Whole Oats', value: 'Whole Oats' },
      { name: 'Rye Berries', value: 'Rye Berries' },
      { name: 'Wheat Berries', value: 'Wheat Berries' },
      { name: 'Millet', value: 'Millet' },
      { name: 'Sorghum', value: 'Sorghum' },
      { name: 'Corn/Popcorn', value: 'Corn/Popcorn' }
    ]
  },
  LIQUID: {
    label: 'Liquid',
    icon: '💧',
    items: [
      { name: 'Liquid Culture (LC)', value: 'Liquid Culture' },
      { name: 'Malt Extract Broth', value: 'Malt Extract Broth' },
      { name: 'Water', value: 'Water' }
    ]
  },
  AGAR: {
    label: 'Agar',
    icon: '🧫',
    items: [
      { name: 'Malt Extract Agar', value: 'Malt Extract Agar' },
      { name: 'Potato Dextrose Agar', value: 'Potato Dextrose Agar' }
    ]
  },
  SUBSTRATE: {
    label: 'Substrate',
    icon: '🍄',
    items: [
      { name: 'Coco Coir', value: 'Coco Coir' },
      { name: "Master's Mix", value: "Master's Mix" },
      { name: 'Hardwood Sawdust', value: 'Hardwood Sawdust' }
    ]
  }
};

// Container categories with their display names, primary medium categories,
// and standard capacity in mL (used for PC load calculations).
export const CONTAINER_CATEGORIES = {
  JAR: {
    label: 'Jars',
    icon: '🫙',
    primaryMediums: ['GRAIN', 'SUBSTRATE'],
    items: [
      { name: 'Pint Wide Mouth', value: 'Pint Wide Mouth', capacityMl: 473 },
      { name: 'Quart Wide Mouth', value: 'Quart Wide Mouth', capacityMl: 950 },
      { name: 'Half Gallon Wide Mouth', value: 'Half Gallon Wide Mouth', capacityMl: 1893 }
    ]
  },
  BAG: {
    label: 'Bags',
    icon: '🛍️',
    primaryMediums: ['GRAIN', 'SUBSTRATE'],
    items: [
      { name: 'Unicorn Bag 3lb', value: 'Unicorn Bag 3lb', capacityMl: 1360 },
      { name: 'Unicorn Bag 4lb', value: 'Unicorn Bag 4lb', capacityMl: 1814 },
      { name: 'Unicorn Bag 5lb', value: 'Unicorn Bag 5lb', capacityMl: 2268 },
      { name: 'Micro-perforated', value: 'Micro-perforated', capacityMl: 1000 }
    ]
  },
  MEDIA_BOTTLE: {
    label: 'Media Bottles',
    icon: '🧪',
    primaryMediums: ['LIQUID', 'AGAR'],
    items: [
      { name: '500ml GL45', value: '500ml GL45', capacityMl: 500 },
      { name: '1000ml GL45', value: '1000ml GL45', capacityMl: 1000 }
    ]
  },
  FLASK: {
    label: 'Flasks',
    icon: '⚗️',
    primaryMediums: ['LIQUID', 'AGAR'],
    items: [
      { name: '500ml Erlenmeyer', value: '500ml Erlenmeyer', capacityMl: 500 },
      { name: '1000ml Erlenmeyer', value: '1000ml Erlenmeyer', capacityMl: 1000 },
      { name: '2000ml Erlenmeyer', value: '2000ml Erlenmeyer', capacityMl: 2000 }
    ]
  }
};

// Map a medium value to its category key
export function getMediumCategory(mediumValue) {
  if (!mediumValue) return null;
  for (const [key, cat] of Object.entries(MEDIUM_CATEGORIES)) {
    if (cat.items.some(i => i.value === mediumValue)) return key;
  }
  return null;
}

// Map a container value to its category key
export function getContainerCategory(containerValue) {
  if (!containerValue) return null;
  for (const [key, cat] of Object.entries(CONTAINER_CATEGORIES)) {
    if (cat.items.some(i => i.value === containerValue)) return key;
  }
  return null;
}

// Get the standard capacity (mL) for a container value
export function getContainerCapacityMl(containerValue) {
  if (!containerValue) return 500;
  for (const [key, cat] of Object.entries(CONTAINER_CATEGORIES)) {
    const item = cat.items.find(i => i.value === containerValue);
    if (item) return item.capacityMl;
  }
  return 500;
}

// Check if a medium/container pair is unconventional (non-blocking warning)
export function isUnconventionalPair(mediumValue, containerValue) {
  const mediumCat = getMediumCategory(mediumValue);
  const containerCat = getContainerCategory(containerValue);
  if (!mediumCat || !containerCat) return false;
  const container = CONTAINER_CATEGORIES[containerCat];
  return !container.primaryMediums.includes(mediumCat);
}

// --- Base URL Resolution for QR Codes & Shareable Links ---
// Resolves the canonical app base URL used to build permanent QR code payloads.
// Priority 1: Explicit env var (VITE_APP_URL or NEXT_PUBLIC_APP_URL) set at deploy time.
// Priority 2: Current browser origin, unless we're on a temporary dev tunnel.
// Priority 3: Production fallback domain.
export const getAppBaseUrl = () => {
  // Priority 1: Explicit production/environment base URL
  // Note: optional chaining keeps this safe when the app is served without a
  // bundler (plain ES modules), where `import.meta.env` is undefined.
  const envUrl =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_URL) ||
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_APP_URL);
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }
  // Priority 2: Current browser origin (if not on a temporary dev tunnel)
  if (typeof window !== 'undefined' && !window.location.hostname.includes('devtunnels.ms')) {
    return window.location.origin;
  }
  // Fallback: Default production domain
  return 'https://sierramycolab.com'; // Production live domain
};

// Returns true when the app is running from a temporary dev environment
// (dev tunnel or localhost) without an explicit production base URL set.
export const isUsingTemporaryBaseUrl = () => {
  if (typeof window === 'undefined') return false;
  const envUrl =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_URL) ||
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_APP_URL);
  if (envUrl) return false;
  const hostname = window.location.hostname;
  return hostname.includes('devtunnels.ms') || hostname === 'localhost' || hostname === '127.0.0.1';
};

// Application settings
export const APP_CONFIG = {
  APP_NAME: 'Sierra Myco Lab',
  // Bump this whenever the local storage schema or cached data format changes.
  // On launch, if the stored version tag doesn't match, localStorage is cleared
  // to prevent out-of-sync builds across different browsers.
  APP_VERSION: '1.0.0',
  STORAGE_KEYS: {
    ITEMS: 'myco_items_v5',
    BATCHES: 'myco_batches_v5',
    CUSTOM_CONTAINERS: 'myco_custom_containers',
    CUSTOM_MEDIUMS: 'myco_custom_mediums',
    CUSTOM_PRESETS: 'myco_custom_presets',
    PRINT_LAYOUT: 'myco_print_layout',
    PRINT_OFFSET: 'myco_print_offset',
    PRINT_INCLUDE_CONTAINER: 'myco_print_include_container',
    FEEDBACK: 'myco_feedback',
    AI_CHAT: 'myco_ai_chat',
    VERSION_TAG: 'myco_version_tag'
  },
  DEFAULT_PRINT_LAYOUT: '30-up',
  DEFAULT_PRINT_OFFSET: 1,
  MAX_G2G_TRANSFER_QTY: 4,
  DRY_YIELD_RATIO: 0.1 // ~10% estimated dry weight from wet weight
};

// Supabase credentials (configure before enabling cloud sync)
export const SUPABASE_URL = 'https://wsalxxsjnxptoeduwfqw.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_BotNKDv8qzsonc1Rf3rEkQ_-s8K1esY';

// Legacy object form (kept for backwards compatibility, mirrors constants above)
export const SUPABASE = {
  url: SUPABASE_URL,       // e.g. 'https://YOUR-PROJECT.supabase.co'
  anonKey: SUPABASE_ANON_KEY    // your anon / public API key
};

// Gemini AI credentials (configure before enabling AI assistant)
export const GEMINI = {
  apiKey: '',    // your Gemini API key from https://aistudio.google.com/apikey
  model: 'gemini-2.5-flash',
  endpoint: 'https://generativelanguage.googleapis.com/v1beta/models'
};