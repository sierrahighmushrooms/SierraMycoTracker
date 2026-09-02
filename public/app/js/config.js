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
  },
  ALL_IN_ONE: {
    label: 'All-In-One',
    icon: '📦',
    items: [
      { name: 'All In One (AIO)', value: 'All In One' }
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
      { name: 'Pint Wide Mouth', value: 'Pint Wide Mouth', capacityMl: 473, defaultWeightLbs: 0.65 },
      { name: 'Quart Wide Mouth', value: 'Quart Wide Mouth', capacityMl: 950, defaultWeightLbs: 1.25 },
      { name: 'Half Gallon Wide Mouth', value: 'Half Gallon Wide Mouth', capacityMl: 1893, defaultWeightLbs: 2.50 }
    ]
  },
  BAG: {
    label: 'Bags',
    icon: '🛍️',
    primaryMediums: ['GRAIN', 'SUBSTRATE'],
    items: [
      { name: 'Unicorn Bag 3lb', value: 'Unicorn Bag 3lb', capacityMl: 1360, defaultWeightLbs: 3.00 },
      { name: 'Unicorn Bag 4lb', value: 'Unicorn Bag 4lb', capacityMl: 1814, defaultWeightLbs: 4.00 },
      { name: 'Unicorn Bag 5lb', value: 'Unicorn Bag 5lb', capacityMl: 2268, defaultWeightLbs: 5.00 },
      { name: 'Micro-perforated', value: 'Micro-perforated', capacityMl: 1000, defaultWeightLbs: 2.00 }
    ]
  },
  MEDIA_BOTTLE: {
    label: 'Media Bottles',
    icon: '🧪',
    primaryMediums: ['LIQUID', 'AGAR'],
    items: [
      { name: '500ml GL45', value: '500ml GL45', capacityMl: 500, defaultWeightLbs: 1.10 },
      { name: '1000ml GL45', value: '1000ml GL45', capacityMl: 1000, defaultWeightLbs: 2.20 }
    ]
  },
  FLASK: {
    label: 'Flasks',
    icon: '⚗️',
    primaryMediums: ['LIQUID', 'AGAR'],
    items: [
      { name: '500ml Erlenmeyer', value: '500ml Erlenmeyer', capacityMl: 500, defaultWeightLbs: 1.10 },
      { name: '1000ml Erlenmeyer', value: '1000ml Erlenmeyer', capacityMl: 1000, defaultWeightLbs: 2.20 },
      { name: '2000ml Erlenmeyer', value: '2000ml Erlenmeyer', capacityMl: 2000, defaultWeightLbs: 4.40 }
    ]
  }
};

// Built-in fallback container default weights (in lbs)
export const DEFAULT_CONTAINER_WEIGHTS = {
  'Quart Wide Mouth': 1.25,
  'Pint Wide Mouth': 0.65,
  'Half Gallon Wide Mouth': 2.50,
  'Unicorn Bag 3lb': 3.00,
  'Unicorn Bag 4lb': 4.00,
  'Unicorn Bag 5lb': 5.00,
  'Micro-perforated': 2.00,
  '500ml GL45': 1.10,
  '1000ml GL45': 2.20,
  '500ml Erlenmeyer': 1.10,
  '1000ml Erlenmeyer': 2.20,
  '2000ml Erlenmeyer': 4.40
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
// Priority 1: Configured orgBaseUrl in localStorage from Org Settings.
// Priority 2: Explicit env var (VITE_APP_URL or NEXT_PUBLIC_APP_URL) set at deploy time.
// Priority 3: Current browser origin + '/app' — the PWA is mounted at /app/ under
//             the marketing site, so the bare origin would produce QR/deep links
//             that land on the public landing page instead of the app.
// Priority 4: Production fallback domain (also '/app').
// Priorities 1 and 2 are treated as complete, explicitly-configured base URLs and
// are used verbatim (trailing slash trimmed) — the operator sets them to whatever
// their custom scan domain serves the app from.
export const getAppBaseUrl = () => {
  // Priority 1: Configured custom scan domain in organization settings
  if (typeof window !== 'undefined') {
    const orgBaseUrl = localStorage.getItem('orgBaseUrl');
    if (orgBaseUrl && orgBaseUrl.trim()) {
      return orgBaseUrl.trim().replace(/\/$/, '');
    }
  }

  // Priority 2: Explicit production/environment base URL
  const envUrl =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_URL) ||
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_APP_URL);
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }
  // Priority 3: Derive from the current origin, appending the /app/ mount point.
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return `${window.location.origin}/app`;
  }
  // Fallback: Default production domain (PWA is served from /app/)
  return 'https://sierramycolab.com/app';
};

// Returns true when the app is running from a temporary dev environment
// (dev tunnel or localhost) without an explicit production base URL set.
export const isUsingTemporaryBaseUrl = () => {
  if (typeof window === 'undefined') return false;
  const orgBaseUrl = localStorage.getItem('orgBaseUrl');
  if (orgBaseUrl && orgBaseUrl.trim()) return false;
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
    PRINT_SHOW_NAME: 'myco_print_show_name',
    PRINT_SHOW_BATCH_ID: 'myco_print_show_batch_id',
    PRINT_SHOW_STRAIN: 'myco_print_show_strain',
    PRINT_SHOW_DATES: 'myco_print_show_dates',
    PRINT_SHOW_LOGO: 'myco_print_show_logo',
    PRINT_ENABLE_HANDWRITING: 'myco_print_enable_handwriting',
    PRINT_CUSTOM_HANDWRITING_LINES: 'myco_print_custom_handwriting_lines',
    ORG_BASE_URL: 'orgBaseUrl',
    ORG_LOGO_DATA: 'orgLogoData',
    PRINTER_TYPE: 'myco_printer_type',
    LABEL_MODEL: 'myco_label_model',
    CUSTOM_LABEL_DIMS: 'myco_custom_label_dims',
    FEEDBACK: 'myco_feedback',
    AI_CHAT: 'myco_ai_chat',
    VERSION_TAG: 'myco_version_tag'
  },
  DEFAULT_PRINT_LAYOUT: '30-up',
  DEFAULT_PRINT_OFFSET: 1,
  DEFAULT_PRINTER_TYPE: 'sheet',
  DEFAULT_LABEL_MODEL: 'avery-5160',
  MAX_G2G_TRANSFER_QTY: 4,
  DRY_YIELD_RATIO: 0.1 // ~10% estimated dry weight from wet weight
};

// --- Harvest Forecast Timeline ---
// Estimated total calendar days from inoculation to the first harvestable
// flush, per strain. These are rough planning figures (colonization +
// pinning + first fruiting) for a typical fruiting block / monotub at room
// conditions — they are deliberately conservative so the Harvest Forecast
// Calendar under-promises rather than over-promises for market planning.
// Keys are matched case-insensitively, first by exact strain name and then
// by substring, so "Blue Oyster (PO)" still resolves to the Blue Oyster row.
export const HARVEST_TIMELINE_DAYS = {
  'Blue Oyster': 21,
  'Pearl Oyster': 21,
  'Pink Oyster': 18,
  'Golden Oyster': 20,
  'King Oyster': 28,
  "Lion's Mane": 28,
  'Shiitake': 60,
  'Chestnut': 35,
  'Nameko': 45,
  'Pioppino': 30,
  'Reishi': 45,
  'Turkey Tail': 45,
  'Maitake': 60,
  'Enoki': 40,
  'Wine Cap': 40
};

// Fallback timeline (days) used for any strain not listed above.
export const DEFAULT_HARVEST_TIMELINE_DAYS = 24;

// Resolve the estimated inoculation-to-harvest day count for a strain name.
// Falls back to DEFAULT_HARVEST_TIMELINE_DAYS for unknown / blank strains.
export function harvestDaysForStrain(strain) {
  if (!strain || typeof strain !== 'string') return DEFAULT_HARVEST_TIMELINE_DAYS;
  const needle = strain.trim().toLowerCase();
  if (!needle) return DEFAULT_HARVEST_TIMELINE_DAYS;

  // 1) Exact (case-insensitive) match on the configured strain name.
  for (const [name, days] of Object.entries(HARVEST_TIMELINE_DAYS)) {
    if (name.toLowerCase() === needle) return days;
  }
  // 2) Substring match either direction, so decorated names
  //    ("Blue Oyster (PO-spp)") and shorthand ("blue oyster block") both hit.
  for (const [name, days] of Object.entries(HARVEST_TIMELINE_DAYS)) {
    const key = name.toLowerCase();
    if (needle.includes(key) || key.includes(needle)) return days;
  }
  return DEFAULT_HARVEST_TIMELINE_DAYS;
}

// --- Label Printing Hardware Configuration Matrix ---
// Defines every supported "Printer Type" + "Label Model" combination with the
// physical dimensions, margins, and grid layout needed to generate correct
// CSS @page rules and PDF/print coordinates. Dimensions are in inches.
export const PRINTER_TYPES = {
  SHEET: 'sheet',
  THERMAL: 'thermal'
};

export const LABEL_TEMPLATES = {
  'avery-5160': {
    name: 'Avery 5160 — 30-Up Address Labels (2.625" x 1")',
    printerType: PRINTER_TYPES.SHEET,
    page: { width: 8.5, height: 11 },
    margin: { top: 0.5, bottom: 0.5, left: 0.1875, right: 0.1875 },
    label: { width: 2.625, height: 1.0 },
    grid: { cols: 3, rows: 10 },
    gap: { col: 0.125, row: 0 },
    slots: 30
  },
  'avery-5163': {
    name: 'Avery 5163 — 10-Up Shipping Labels (4" x 2")',
    printerType: PRINTER_TYPES.SHEET,
    page: { width: 8.5, height: 11 },
    margin: { top: 0.5, bottom: 0.5, left: 0.15625, right: 0.15625 },
    label: { width: 4.0, height: 2.0 },
    grid: { cols: 2, rows: 5 },
    gap: { col: 0.1875, row: 0 },
    slots: 10
  },
  'generic-4x5': {
    name: 'Generic 4-Up Sheet (4" x 5")',
    printerType: PRINTER_TYPES.SHEET,
    page: { width: 8.5, height: 11 },
    margin: { top: 0.5, bottom: 0.5, left: 0.25, right: 0.25 },
    label: { width: 4.0, height: 5.0 },
    grid: { cols: 2, rows: 2 },
    gap: { col: 0.0, row: 0.0 },
    slots: 4
  },
  'generic-20-up': {
    name: 'Generic 20-Up Sheet (4" x 1")',
    printerType: PRINTER_TYPES.SHEET,
    page: { width: 8.5, height: 11 },
    margin: { top: 0.5, bottom: 0.5, left: 0.175, right: 0.175 },
    label: { width: 4.0, height: 1.0 },
    grid: { cols: 2, rows: 10 },
    gap: { col: 0.15, row: 0 },
    slots: 20
  },
  'generic-80-up': {
    name: 'Generic 80-Up Mini Sheet (1.75" x 0.5")',
    printerType: PRINTER_TYPES.SHEET,
    page: { width: 8.5, height: 11 },
    margin: { top: 0.5, bottom: 0.5, left: 0.6, right: 0.6 },
    label: { width: 1.75, height: 0.5 },
    grid: { cols: 4, rows: 20 },
    gap: { col: 0.1, row: 0 },
    slots: 80
  },
  'dymo-30321': {
    name: 'DYMO 30321 — Thermal Roll (2-1/8" x 4")',
    printerType: PRINTER_TYPES.THERMAL,
    page: { width: 2.125, height: 4.0 },
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
    label: { width: 2.125, height: 4.0 },
    grid: { cols: 1, rows: 1 },
    gap: { col: 0, row: 0 },
    slots: 1,
    continuous: true
  },
  'dymo-30336': {
    name: 'DYMO 30336 — Thermal Roll (1" x 2-1/8")',
    printerType: PRINTER_TYPES.THERMAL,
    page: { width: 1.0, height: 2.125 },
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
    label: { width: 2.125, height: 1.0 },
    grid: { cols: 1, rows: 1 },
    gap: { col: 0, row: 0 },
    slots: 1,
    continuous: true
  },
  'thermal-continuous': {
    name: 'Generic Continuous Roll / Single Label',
    printerType: PRINTER_TYPES.THERMAL,
    page: { width: 4.0, height: 1.0 },
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
    label: { width: 4.0, height: 1.0 },
    grid: { cols: 1, rows: 1 },
    gap: { col: 0, row: 0 },
    slots: 1,
    continuous: true
  },
  'custom': {
    name: 'Custom Dimensions…',
    printerType: null, // works for either printer type — dims supplied manually
    custom: true
  }
};

// Backwards-compatible mapping from the legacy hardcoded layout keys
// (used before the Printer Type / Label Model hardware matrix existed)
// to the new label template keys, so existing saved user settings keep working.
export const LEGACY_LAYOUT_MAP = {
  '30-up': 'avery-5160',
  '10-up': 'avery-5163',
  '20-up': 'generic-20-up',
  '80-up': 'generic-80-up',
  'single': 'thermal-continuous'
};

// Resolve a label template by key, following the legacy map and falling back
// to the default sheet template if the key is unknown.
export function resolveLabelTemplate(key) {
  if (key && LABEL_TEMPLATES[key]) return LABEL_TEMPLATES[key];
  if (key && LEGACY_LAYOUT_MAP[key] && LABEL_TEMPLATES[LEGACY_LAYOUT_MAP[key]]) {
    return LABEL_TEMPLATES[LEGACY_LAYOUT_MAP[key]];
  }
  return LABEL_TEMPLATES[APP_CONFIG.DEFAULT_LABEL_MODEL];
}

// Get the list of label models available for a given printer type (always
// includes the 'custom' option as a manual-override fallback).
export function getLabelModelsForPrinterType(printerType) {
  return Object.entries(LABEL_TEMPLATES)
    .filter(([key, tmpl]) => tmpl.printerType === printerType || tmpl.custom)
    .map(([key, tmpl]) => ({ key, name: tmpl.name }));
}

// Square OAuth & Payments Configuration
export const SQUARE_CONFIG = {
  APPLICATION_ID: 'sq0idp-T2BxJMzFqiatyH5XW4iX1g',
  SCOPES: ['PAYMENTS_WRITE', 'ORDERS_WRITE', 'MERCHANT_PROFILE_READ'],
  AUTH_BASE_URL: 'https://connect.squareup.com/oauth2/authorize',
  APP_FEE_PERCENTAGE: 0.01 // 1% platform revenue fee split
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
