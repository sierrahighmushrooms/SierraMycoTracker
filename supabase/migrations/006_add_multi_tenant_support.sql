-- Migration: Add Multi-Tenant Organization and Location Support
-- Description: Creates organizations, organization_members, and locations tables. Adds organization_id and location_id to items. Implements Row Level Security (RLS).

-- ============================================================================
-- 1. ORGANIZATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on organizations
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read organizations they belong to
DROP POLICY IF EXISTS "Users can view own organizations" ON public.organizations;
CREATE POLICY "Users can view own organizations" ON public.organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = id
      AND organization_members.user_id = auth.uid()
    )
  );

-- Policy: Users can update organizations they are owners/admins of
DROP POLICY IF EXISTS "Owners/admins can update organizations" ON public.organizations;
CREATE POLICY "Owners/admins can update organizations" ON public.organizations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.organization_id = id
      AND organization_members.user_id = auth.uid()
      AND organization_members.role IN ('owner', 'admin')
    )
  );

-- Policy: Authenticated users can insert/create organizations
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;
CREATE POLICY "Authenticated users can create organizations" ON public.organizations
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- 2. ORGANIZATION MEMBERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

-- Enable RLS on organization_members
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view membership records for organizations they belong to
DROP POLICY IF EXISTS "Members can view organization memberships" ON public.organization_members;
CREATE POLICY "Members can view organization memberships" ON public.organization_members
  FOR SELECT USING (
    user_id = auth.uid() OR
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

-- Policy: Owner/admins can manage memberships
DROP POLICY IF EXISTS "Owners/admins can manage memberships" ON public.organization_members;
CREATE POLICY "Owners/admins can manage memberships" ON public.organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

-- Policy: Authenticated users can insert memberships (needed during onboarding)
DROP POLICY IF EXISTS "Authenticated users can join/create memberships" ON public.organization_members;
CREATE POLICY "Authenticated users can join/create memberships" ON public.organization_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 3. LOCATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on locations
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view locations in organizations they belong to
DROP POLICY IF EXISTS "Members can view locations" ON public.locations;
CREATE POLICY "Members can view locations" ON public.locations
  FOR SELECT USING (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

-- Policy: Owners/admins/members can manage locations in organizations they belong to
DROP POLICY IF EXISTS "Members can manage locations" ON public.locations;
CREATE POLICY "Members can manage locations" ON public.locations
  FOR ALL USING (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin', 'member')
    )
  );

-- ============================================================================
-- 4. ALTER ITEMS TABLE (ADD ORG/LOC COLUMNS & FOREIGNS)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'items' 
    AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.items ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'items' 
    AND column_name = 'location_id'
  ) THEN
    ALTER TABLE public.items ADD COLUMN location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_items_organization_id ON public.items(organization_id);
CREATE INDEX IF NOT EXISTS idx_items_location_id ON public.items(location_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_locations_organization_id ON public.locations(organization_id);

-- ============================================================================
-- 5. UPDATE ITEMS ROW LEVEL SECURITY
-- ============================================================================
-- Drop old policies on items table
DROP POLICY IF EXISTS "Users can view own items" ON public.items;
DROP POLICY IF EXISTS "Users can insert own items" ON public.items;
DROP POLICY IF EXISTS "Users can update own items" ON public.items;
DROP POLICY IF EXISTS "Users can delete own items" ON public.items;

-- Policy: Users can view items if they own them OR belong to the same organization
CREATE POLICY "Users can view items" ON public.items
  FOR SELECT USING (
    auth.uid() = user_id OR
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

-- Policy: Users can insert items if they own them OR belong to the same organization
CREATE POLICY "Users can insert items" ON public.items
  FOR INSERT WITH CHECK (
    auth.uid() = user_id OR
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

-- Policy: Users can update items if they own them OR belong to the same organization
CREATE POLICY "Users can update items" ON public.items
  FOR UPDATE USING (
    auth.uid() = user_id OR
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

-- Policy: Users can delete items if they own them OR belong to the same organization
CREATE POLICY "Users can delete items" ON public.items
  FOR DELETE USING (
    auth.uid() = user_id OR
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );
