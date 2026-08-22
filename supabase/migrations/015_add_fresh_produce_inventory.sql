-- Create fresh_produce_inventory table for cold storage and sales
CREATE TABLE IF NOT EXISTS public.fresh_produce_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    container_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
    strain TEXT NOT NULL,
    batch_code TEXT,
    flush_number TEXT DEFAULT 'Flush #1',
    harvest_date DATE DEFAULT CURRENT_DATE,
    weight_harvested NUMERIC NOT NULL DEFAULT 0,
    weight_available NUMERIC NOT NULL DEFAULT 0,
    unit TEXT DEFAULT 'lbs',
    weight_grams NUMERIC NOT NULL DEFAULT 0,
    grade TEXT DEFAULT 'Grade A (Wholesale)',
    cooler_location TEXT DEFAULT 'Walk-in Cooler 1',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.fresh_produce_inventory ENABLE ROW LEVEL SECURITY;

-- Permissive policies / tenant policies
CREATE POLICY "Enable read access for all users" ON public.fresh_produce_inventory FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.fresh_produce_inventory FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON public.fresh_produce_inventory FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON public.fresh_produce_inventory FOR DELETE USING (true);

-- Index for organization and strain searches
CREATE INDEX IF NOT EXISTS idx_fresh_produce_org ON public.fresh_produce_inventory(organization_id);
CREATE INDEX IF NOT EXISTS idx_fresh_produce_strain ON public.fresh_produce_inventory(strain);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';