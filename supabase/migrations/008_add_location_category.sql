-- Add category column to locations table to support categorizing custom-named locations
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Other'
  CHECK (category = ANY (ARRAY['Lab / Clean Room','Incubation','Fruiting','Storage','Processing','Other']));
