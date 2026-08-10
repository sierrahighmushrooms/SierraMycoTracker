-- Migration: Add prep_date, container_capacity, container_type columns to items
-- and create custom_presets table for user-defined container/medium presets.

-- 1) Add new columns to the items table (if they don't already exist)
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS prep_date TEXT,
  ADD COLUMN IF NOT EXISTS container_capacity NUMERIC,
  ADD COLUMN IF NOT EXISTS container_type TEXT;

-- 2) Create the custom_presets table for user-defined presets
--    (containers and mediums with metadata for smart filtering & PC load calc)
CREATE TABLE IF NOT EXISTS custom_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preset_type TEXT NOT NULL CHECK (preset_type IN ('container', 'medium')),
  name TEXT NOT NULL,
  -- Container-specific fields
  container_type TEXT,          -- Jar, Bag, Bottle, Flask, Other
  capacity_value NUMERIC,       -- numeric capacity
  capacity_unit TEXT,           -- ml, qt, lb, oz
  recommended_medium TEXT,      -- Grain, Liquid, Agar, Substrate, All
  -- Medium-specific fields
  medium_category TEXT,         -- GRAIN, LIQUID, AGAR, SUBSTRATE
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, preset_type, name)
);

-- 3) Enable RLS on custom_presets
ALTER TABLE custom_presets ENABLE ROW LEVEL SECURITY;

-- 4) RLS policies: users can only see/manage their own presets
CREATE POLICY "Users can view own presets"
  ON custom_presets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own presets"
  ON custom_presets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own presets"
  ON custom_presets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own presets"
  ON custom_presets FOR DELETE
  USING (auth.uid() = user_id);

-- 5) Index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_custom_presets_user_id ON custom_presets(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_presets_user_type ON custom_presets(user_id, preset_type);