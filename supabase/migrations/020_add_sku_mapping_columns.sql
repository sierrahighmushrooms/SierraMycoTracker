-- Migration: 020_add_sku_mapping_columns.sql
-- Description: Ensure SKU mappings support deduction quantities, item ids, image url, and pricing

ALTER TABLE public.sku_mappings ADD COLUMN IF NOT EXISTS deduct_qty NUMERIC DEFAULT 1;
ALTER TABLE public.sku_mappings ADD COLUMN IF NOT EXISTS etsy_item_id TEXT;
ALTER TABLE public.sku_mappings ADD COLUMN IF NOT EXISTS inventory_item_id TEXT;
ALTER TABLE public.sku_mappings ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.sku_mappings ADD COLUMN IF NOT EXISTS price NUMERIC;

NOTIFY pgrst, 'reload schema';