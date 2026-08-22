-- Migration: 018_add_etsy_integration.sql
-- Description: Create tables and RLS policies for Etsy API v3 integration and SKU mappings

-- 1. Table for Etsy OAuth Credentials & Shop Info
CREATE TABLE IF NOT EXISTS public.etsy_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    etsy_user_id TEXT,
    etsy_shop_id TEXT,
    etsy_shop_name TEXT,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_type TEXT DEFAULT 'bearer',
    expires_at TIMESTAMPTZ NOT NULL,
    pkce_code_verifier TEXT,
    state TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Table for Linking Internal Inventory to Etsy Listings & SKUs
CREATE TABLE IF NOT EXISTS public.sku_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    inventory_id UUID, -- References internal inventory item or fresh produce
    listing_id TEXT NOT NULL,
    product_id TEXT,
    sku TEXT,
    title TEXT,
    etsy_quantity INT DEFAULT 0,
    sync_inventory BOOLEAN DEFAULT true,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, listing_id, sku)
);

-- 3. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_etsy_integrations_user_id ON public.etsy_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_etsy_integrations_shop_id ON public.etsy_integrations(etsy_shop_id);
CREATE INDEX IF NOT EXISTS idx_sku_mappings_user_id ON public.sku_mappings(user_id);
CREATE INDEX IF NOT EXISTS idx_sku_mappings_inventory_id ON public.sku_mappings(inventory_id);
CREATE INDEX IF NOT EXISTS idx_sku_mappings_listing_id ON public.sku_mappings(listing_id);
CREATE INDEX IF NOT EXISTS idx_sku_mappings_sku ON public.sku_mappings(sku);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.etsy_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sku_mappings ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for etsy_integrations
CREATE POLICY "Users can view their own Etsy integration"
    ON public.etsy_integrations
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Etsy integration"
    ON public.etsy_integrations
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Etsy integration"
    ON public.etsy_integrations
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Etsy integration"
    ON public.etsy_integrations
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- 6. RLS Policies for sku_mappings
CREATE POLICY "Users can view their own SKU mappings"
    ON public.sku_mappings
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own SKU mappings"
    ON public.sku_mappings
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own SKU mappings"
    ON public.sku_mappings
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own SKU mappings"
    ON public.sku_mappings
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- 7. Reload PostgREST Schema Cache
NOTIFY pgrst, 'reload schema';