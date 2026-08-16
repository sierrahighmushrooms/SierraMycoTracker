-- Migration: Add settings JSONB column to organizations
-- Description: Adds a settings JSONB column to store feature toggles for each organization.

ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{"enable_sales": false, "enable_racks": false, "enable_supplies": false}'::jsonb;
