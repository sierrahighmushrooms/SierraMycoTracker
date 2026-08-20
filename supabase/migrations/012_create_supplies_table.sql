-- Create supplies table
CREATE TABLE IF NOT EXISTS supplies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT,
    quantity_on_hand NUMERIC DEFAULT 0,
    unit_of_measure TEXT,
    reorder_threshold NUMERIC,
    is_dry_ingredient BOOLEAN DEFAULT false,
    is_non_depleting BOOLEAN DEFAULT false,
    package_size TEXT,
    package_cost NUMERIC,
    reorder_url TEXT,
    supplier TEXT,
    product_code TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE supplies ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for authenticated and anon users (as requested)
CREATE POLICY "Enable read access for all users" ON supplies FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON supplies FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON supplies FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON supplies FOR DELETE USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_supplies_updated_at
    BEFORE UPDATE ON supplies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Reload schema cache
NOTIFY pgrst, 'reload schema';