-- Migration: Add Racks / Shelving Units table
-- Description: Creates a racks table for physical rack/shelf tracking, scoped to a location within an organization.

CREATE TABLE IF NOT EXISTS public.racks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  preset TEXT,
  shelf_count INTEGER NOT NULL DEFAULT 4,
  capacity_per_shelf TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.racks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view racks" ON public.racks;
CREATE POLICY "Members can view racks" ON public.racks
  FOR SELECT USING (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members can manage racks" ON public.racks;
CREATE POLICY "Members can manage racks" ON public.racks
  FOR ALL USING (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin', 'member')
    )
  );

CREATE INDEX IF NOT EXISTS idx_racks_organization_id ON public.racks(organization_id);
CREATE INDEX IF NOT EXISTS idx_racks_location_id ON public.racks(location_id);
