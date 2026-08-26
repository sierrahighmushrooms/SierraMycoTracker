-- Migration: 022_add_retail_products.sql
-- Description: Create the retail_products table backing "Create & Link Item"
-- auto-generation from unmapped Etsy SKUs during SKU mapping. RLS follows the
-- current org-membership convention (is_org_member()), matching the pattern
-- established in 021_lockdown_open_rls_policies.sql rather than the older
-- permissive USING (true) policies seen on some legacy tables.

-- CREATE OR REPLACE (not CREATE) since this helper already exists on
-- databases that ran 012_create_supplies_table.sql; kept here too so this
-- migration also runs cleanly standalone on a fresh database.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.retail_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sku TEXT,
    category TEXT DEFAULT 'Retail Product',
    stage TEXT DEFAULT 'Ready',
    price NUMERIC DEFAULT 0,
    quantity NUMERIC DEFAULT 0,
    unit_of_measure TEXT DEFAULT 'units',
    listing_id TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retail_products_org_id ON public.retail_products(organization_id);
CREATE INDEX IF NOT EXISTS idx_retail_products_sku ON public.retail_products(sku);
CREATE INDEX IF NOT EXISTS idx_retail_products_listing_id ON public.retail_products(listing_id);

ALTER TABLE public.retail_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view and manage retail products in their org"
    ON public.retail_products
    FOR ALL
    USING (is_org_member(organization_id))
    WITH CHECK (is_org_member(organization_id));

CREATE TRIGGER update_retail_products_updated_at
    BEFORE UPDATE ON public.retail_products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

NOTIFY pgrst, 'reload schema';
