-- Add company column to customers table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'company') THEN
        ALTER TABLE public.customers ADD COLUMN company TEXT;
    END IF;
END $$;

-- Reload PostgREST schema cache
NOTIFY pgrst, reload_schema;
