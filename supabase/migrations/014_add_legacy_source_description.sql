-- Migration: Add parent_id and legacy_source_description to items
-- Description: Supports untracked/legacy inoculant sources and lineage tracking.

DO $$
BEGIN
  -- Add parent_id if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'items'
    AND column_name = 'parent_id'
  ) THEN
    ALTER TABLE public.items ADD COLUMN parent_id UUID REFERENCES public.items(id) ON DELETE SET NULL;
  ELSE
    -- Ensure it is nullable
    ALTER TABLE public.items ALTER COLUMN parent_id DROP NOT NULL;
  END IF;

  -- Add legacy_source_description if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'items'
    AND column_name = 'legacy_source_description'
  ) THEN
    ALTER TABLE public.items ADD COLUMN legacy_source_description TEXT;
  END IF;
END $$;

-- Create index for parent_id for faster lineage queries
CREATE INDEX IF NOT EXISTS idx_items_parent_id ON public.items(parent_id);