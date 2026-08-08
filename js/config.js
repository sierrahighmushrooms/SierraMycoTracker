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

// Application settings
export const APP_CONFIG = {
  APP_NAME: 'Sierra Myco Lab',
  STORAGE_KEYS: {
    ITEMS: 'myco_items_v5',
    BATCHES: 'myco_batches_v5',
    CUSTOM_CONTAINERS: 'myco_custom_containers',
    PRINT_LAYOUT: 'myco_print_layout',
    PRINT_OFFSET: 'myco_print_offset',
    PRINT_INCLUDE_CONTAINER: 'myco_print_include_container',
    FEEDBACK: 'myco_feedback',
    AI_CHAT: 'myco_ai_chat'
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
