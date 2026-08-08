-- Migration: Add active container limit enforcement and usage RPC
-- Description: Adds subscription_tier to profiles, creates trigger for limit enforcement,
--              and RPC function for UI usage checks.

-- ============================================================================
-- 1. PROFILES TABLE WITH SUBSCRIPTION TIER
-- ============================================================================

-- Create profiles table if it doesn't exist (linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_tier TEXT NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free', 'grower', 'commercial')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add subscription_tier column if profiles table already exists without it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'subscription_tier'
  ) THEN
    ALTER TABLE public.profiles 
    ADD COLUMN subscription_tier TEXT NOT NULL DEFAULT 'free' 
    CHECK (subscription_tier IN ('free', 'grower', 'commercial'));
  END IF;
END $$;

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Policy: Users can update their own profile (but not subscription_tier directly - that's managed by admin/payment system)
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Policy: Service role can do everything (for admin/payment webhooks)
DROP POLICY IF EXISTS "Service role can manage profiles" ON public.profiles;
CREATE POLICY "Service role can manage profiles" ON public.profiles
  FOR ALL USING (auth.role() = 'service_role');

-- Auto-create profile on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, subscription_tier)
  VALUES (NEW.id, 'free')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call handle_new_user on user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 2. TIER LIMITS CONFIGURATION TABLE (optional, for easy management)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.subscription_tiers (
  tier_name TEXT PRIMARY KEY,
  max_active_containers INTEGER NOT NULL,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert tier limits
INSERT INTO public.subscription_tiers (tier_name, max_active_containers, display_name) VALUES
  ('free', 100, 'Free'),
  ('grower', 500, 'Grower'),
  ('commercial', 999999, 'Commercial')
ON CONFLICT (tier_name) DO UPDATE SET
  max_active_containers = EXCLUDED.max_active_containers,
  display_name = EXCLUDED.display_name;

-- Enable RLS on subscription_tiers (read-only for authenticated users)
ALTER TABLE public.subscription_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view tiers" ON public.subscription_tiers;
CREATE POLICY "Authenticated users can view tiers" ON public.subscription_tiers
  FOR SELECT USING (auth.role() IN ('authenticated', 'anon', 'service_role'));

-- ============================================================================
-- 3. CHECK_CONTAINER_LIMIT TRIGGER FUNCTION
-- ============================================================================

-- Function to check container limit before insert
CREATE OR REPLACE FUNCTION public.check_container_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_tier TEXT;
  v_max_limit INTEGER;
  v_active_count INTEGER;
  v_inactive_stages TEXT[] := ARRAY['Archived', 'Spent', 'Contaminated'];
BEGIN
  -- Get the user's subscription tier
  SELECT subscription_tier INTO v_tier
  FROM public.profiles
  WHERE id = NEW.user_id;
  
  -- Default to 'free' if no profile exists
  IF v_tier IS NULL THEN
    v_tier := 'free';
  END IF;
  
  -- Get the max limit for this tier
  SELECT max_active_containers INTO v_max_limit
  FROM public.subscription_tiers
  WHERE tier_name = v_tier;
  
  -- Default to 100 if tier not found
  IF v_max_limit IS NULL THEN
    v_max_limit := 100;
  END IF;
  
  -- Count active containers (stage NOT in inactive stages)
  -- The stage is stored in the payload jsonb column
  SELECT COUNT(*) INTO v_active_count
  FROM public.items
  WHERE user_id = NEW.user_id
    AND COALESCE(payload->>'stage', 'Preparation') NOT IN (SELECT UNNEST(v_inactive_stages));
  
  -- Check if limit is reached
  IF v_active_count >= v_max_limit THEN
    RAISE EXCEPTION 'Active container limit reached for your current plan. Upgrade to add more containers.'
      USING ERRCODE = 'P0001';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on items table for INSERT
DROP TRIGGER IF EXISTS trg_check_container_limit ON public.items;
CREATE TRIGGER trg_check_container_limit
  BEFORE INSERT ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION public.check_container_limit();

-- ============================================================================
-- 4. GET_CONTAINER_USAGE RPC FUNCTION
-- ============================================================================

-- Function to get container usage for UI display
CREATE OR REPLACE FUNCTION public.get_container_usage(user_uuid UUID)
RETURNS TABLE (
  active_count INTEGER,
  max_limit INTEGER,
  can_create BOOLEAN,
  tier TEXT
) AS $$
DECLARE
  v_tier TEXT;
  v_max_limit INTEGER;
  v_active_count INTEGER;
  v_inactive_stages TEXT[] := ARRAY['Archived', 'Spent', 'Contaminated'];
BEGIN
  -- Get the user's subscription tier
  SELECT p.subscription_tier INTO v_tier
  FROM public.profiles p
  WHERE p.id = user_uuid;
  
  -- Default to 'free' if no profile exists
  IF v_tier IS NULL THEN
    v_tier := 'free';
  END IF;
  
  -- Get the max limit for this tier
  SELECT st.max_active_containers INTO v_max_limit
  FROM public.subscription_tiers st
  WHERE st.tier_name = v_tier;
  
  -- Default to 100 if tier not found
  IF v_max_limit IS NULL THEN
    v_max_limit := 100;
  END IF;
  
  -- Count active containers (stage NOT in inactive stages)
  SELECT COUNT(*) INTO v_active_count
  FROM public.items i
  WHERE i.user_id = user_uuid
    AND COALESCE(i.payload->>'stage', 'Preparation') NOT IN (SELECT UNNEST(v_inactive_stages));
  
  -- Return the result
  active_count := v_active_count;
  max_limit := v_max_limit;
  can_create := v_active_count < v_max_limit;
  tier := v_tier;
  
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_container_usage(UUID) TO authenticated;

-- ============================================================================
-- 5. ENSURE ITEMS TABLE HAS USER_ID COLUMN AND RLS
-- ============================================================================

-- Add user_id column to items if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'items' 
    AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.items ADD COLUMN user_id UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- Enable RLS on items if not already enabled
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own items
DROP POLICY IF EXISTS "Users can view own items" ON public.items;
CREATE POLICY "Users can view own items" ON public.items
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own items (trigger will check limits)
DROP POLICY IF EXISTS "Users can insert own items" ON public.items;
CREATE POLICY "Users can insert own items" ON public.items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own items
DROP POLICY IF EXISTS "Users can update own items" ON public.items;
CREATE POLICY "Users can update own items" ON public.items
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own items
DROP POLICY IF EXISTS "Users can delete own items" ON public.items;
CREATE POLICY "Users can delete own items" ON public.items
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- 6. INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index on items.user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_items_user_id ON public.items(user_id);

-- Index on profiles.id (already primary key, but explicit for clarity)
-- CREATE INDEX IF NOT EXISTS idx_profiles_id ON public.profiles(id);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON TABLE public.profiles IS 'User profiles with subscription tier information';
COMMENT ON TABLE public.subscription_tiers IS 'Subscription tier configuration with container limits';
COMMENT ON FUNCTION public.check_container_limit() IS 'Trigger function to enforce active container limits based on subscription tier';
COMMENT ON FUNCTION public.get_container_usage(UUID) IS 'Returns container usage statistics for UI display';