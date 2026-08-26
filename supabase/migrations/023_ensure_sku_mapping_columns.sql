-- Migration: 023_ensure_sku_mapping_columns.sql
-- Description: Idempotent safety net re-asserting the sku_mappings columns
-- originally added by 020_add_sku_mapping_columns.sql. The repo has two
-- migrations both numbered "020" (020_update_supplies_category_check.sql and
-- 020_add_sku_mapping_columns.sql), and 021_lockdown_open_rls_policies.sql
-- separately notes that migrations 001-020 were never confirmed as applied
-- via supabase migration_history on the live project ("this schema was built
-- by hand over time"). If 020_add_sku_mapping_columns.sql was in fact never
-- run against the live database, any write to sku_mappings that sets
-- deduct_qty/etsy_item_id/inventory_item_id/image_url/price -- e.g.
-- saveSkuMapping()'s upsert in js/etsy.js -- fails with PostgREST's 400
-- "column ... does not exist" error. Every statement below is a no-op if the
-- column is already present, so it is safe to run regardless of whether 020
-- already applied.

ALTER TABLE public.sku_mappings ADD COLUMN IF NOT EXISTS deduct_qty NUMERIC DEFAULT 1;
ALTER TABLE public.sku_mappings ADD COLUMN IF NOT EXISTS etsy_item_id TEXT;
ALTER TABLE public.sku_mappings ADD COLUMN IF NOT EXISTS inventory_item_id TEXT;
ALTER TABLE public.sku_mappings ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.sku_mappings ADD COLUMN IF NOT EXISTS price NUMERIC;

NOTIFY pgrst, 'reload schema';
