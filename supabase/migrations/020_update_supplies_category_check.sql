-- Update supplies table check constraint to include 'Lab / Raw Ingredients'
ALTER TABLE supplies DROP CONSTRAINT IF EXISTS supplies_category_check;
ALTER TABLE supplies ADD CONSTRAINT supplies_category_check 
CHECK (category IN ('Grain', 'Substrate', 'Agar & Petri', 'Liquid Culture', 'Packaging', 'Sanitization', 'Lab / Raw Ingredients', 'Other'));

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';