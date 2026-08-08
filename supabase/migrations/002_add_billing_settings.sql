-- Migration: Add billing settings support
-- Description: Adds subscription_status, lemonsqueezy fields to profiles,
--              updates get_container_usage RPC to return billing info,
--              and adds Lemon Squeezy variant IDs to subscription_tiers.

-- ============================================================================
-- 1. ADD BILLING FIELDS TO PROFILES
-- ============================================================================

-- Add subscription_status column (active, canceled, past_due, expired, none)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'subscription_status'
  ) THEN
    ALTER TABLE public.profiles 
    ADD COLUMN subscription_status TEXT NOT NULL DEFAULT 'none'
    CHECK (subscription_status IN ('active', 'canceled', 'past_due', 'expired', 'trialing', 'none'));
  END IF;
END $$;

-- Add lemonsqueezy_subscription_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'lemonsqueezy_subscription_id'
  ) THEN
    ALTER TABLE public.profiles 
    ADD COLUMN lemonsqueezy_subscription_id TEXT;
  END IF;
END $$;

-- Add lemonsqueezy_customer_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'lemonsqueezy_customer_id'
  ) THEN
    ALTER TABLE public.profiles 
    ADD COLUMN lemonsqueezy_customer_id TEXT;
  END IF;
END $$;

-- Add lemonsqueezy_customer_portal_url column (cached customer portal URL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'lemonsqueezy_customer_portal_url'
  ) THEN
    ALTER TABLE public.profiles 
    ADD COLUMN lemonsqueezy_customer_portal_url TEXT;
  END IF;
END $$;

-- Add subscription_current_period_end column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'subscription_current_period_end'
  ) THEN
    ALTER TABLE public.profiles 
    ADD COLUMN subscription_current_period_end TIMESTAMPTZ;
  END IF;
END $$;

-- ============================================================================
-- 2. ADD LEMON SQUEEZY VARIANT IDS TO SUBSCRIPTION_TIERS
-- ============================================================================

-- Add lemonsqueezy_variant_id column for checkout integration
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'subscription_tiers' 
    AND column_name = 'lemonsqueezy_variant_id'
  ) THEN
    ALTER TABLE public.subscription_tiers 
    ADD COLUMN lemonsqueezy_variant_id TEXT;
  END IF;
END $$;

-- Add monthly_price_cents column for display
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'subscription_tiers' 
    AND column_name = 'monthly_price_cents'
  ) THEN
    ALTER TABLE public.subscription_tiers 
    ADD COLUMN monthly_price_cents INTEGER DEFAULT 0;
  END IF;
END $$;

-- Update tier pricing (configure these with your actual Lemon Squeezy variant IDs)
-- Replace 'YOUR_VARIANT_ID_HERE' with actual variant IDs from Lemon Squeezy dashboard
UPDATE public.subscription_tiers SET 
  lemonsqueezy_variant_id = NULL,  -- Free tier has no checkout
  monthly_price_cents = 0
WHERE tier_name = 'free';

UPDATE public.subscription_tiers SET 
  lemonsqueezy_variant_id = COALESCE(lemonsqueezy_variant_id, 'GROWER_VARIANT_ID'),
  monthly_price_cents = 900
WHERE tier_name = 'grower';

UPDATE public.subscription_tiers SET 
  lemonsqueezy_variant_id = COALESCE(lemonsqueezy_variant_id, 'COMMERCIAL_VARIANT_ID'),
  monthly_price_cents = 2900
WHERE tier_name = 'commercial';

-- ============================================================================
-- 3. UPDATE GET_CONTAINER_USAGE RPC TO INCLUDE BILLING INFO
-- ============================================================================

-- Drop and recreate the function with new return columns
DROP FUNCTION IF EXISTS public.get_container_usage(UUID);

CREATE OR REPLACE FUNCTION public.get_container_usage(user_uuid UUID)
RETURNS TABLE (
  active_count INTEGER,
  max_limit INTEGER,
  can_create BOOLEAN,
  tier TEXT,
  subscription_status TEXT,
  lemonsqueezy_subscription_id TEXT,
  lemonsqueezy_customer_portal_url TEXT,
  subscription_current_period_end TIMESTAMPTZ
) AS $$
DECLARE
  v_tier TEXT;
  v_max_limit INTEGER;
  v_active_count INTEGER;
  v_subscription_status TEXT;
  v_lemonsqueezy_subscription_id TEXT;
  v_lemonsqueezy_customer_portal_url TEXT;
  v_subscription_current_period_end TIMESTAMPTZ;
  v_inactive_stages TEXT[] := ARRAY['Archived', 'Spent', 'Contaminated'];
BEGIN
  -- Get the user's subscription info from profiles
  SELECT 
    p.subscription_tier,
    p.subscription_status,
    p.lemonsqueezy_subscription_id,
    p.lemonsqueezy_customer_portal_url,
    p.subscription_current_period_end
  INTO 
    v_tier,
    v_subscription_status,
    v_lemonsqueezy_subscription_id,
    v_lemonsqueezy_customer_portal_url,
    v_subscription_current_period_end
  FROM public.profiles p
  WHERE p.id = user_uuid;
  
  -- Default to 'free' if no profile exists
  IF v_tier IS NULL THEN
    v_tier := 'free';
    v_subscription_status := 'none';
  END IF;
  
  -- Get the max limit for this tier
  SELECT st.max_active_containers INTO v_max_limit
  FROM public.subscription_tiers st
  WHERE st.tier_name = v_tier;
  
  -- Default to 15 if tier not found
  IF v_max_limit IS NULL THEN
    v_max_limit := 15;
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
  subscription_status := COALESCE(v_subscription_status, 'none');
  lemonsqueezy_subscription_id := v_lemonsqueezy_subscription_id;
  lemonsqueezy_customer_portal_url := v_lemonsqueezy_customer_portal_url;
  subscription_current_period_end := v_subscription_current_period_end;
  
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_container_usage(UUID) TO authenticated;

-- ============================================================================
-- 4. ADD FUNCTION TO GET TIER DETAILS FOR BILLING PAGE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_subscription_tiers()
RETURNS TABLE (
  tier_name TEXT,
  display_name TEXT,
  max_active_containers INTEGER,
  monthly_price_cents INTEGER,
  lemonsqueezy_variant_id TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    st.tier_name,
    st.display_name,
    st.max_active_containers,
    st.monthly_price_cents,
    st.lemonsqueezy_variant_id
  FROM public.subscription_tiers st
  ORDER BY st.max_active_containers ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_subscription_tiers() TO authenticated;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON COLUMN public.profiles.subscription_status IS 'Current subscription status: active, canceled, past_due, expired, trialing, none';
COMMENT ON COLUMN public.profiles.lemonsqueezy_subscription_id IS 'Lemon Squeezy subscription ID for paid plans';
COMMENT ON COLUMN public.profiles.lemonsqueezy_customer_id IS 'Lemon Squeezy customer ID';
COMMENT ON COLUMN public.profiles.lemonsqueezy_customer_portal_url IS 'Cached URL to Lemon Squeezy customer portal';
COMMENT ON FUNCTION public.get_container_usage(UUID) IS 'Returns container usage and subscription billing info for UI display';
COMMENT ON FUNCTION public.get_subscription_tiers() IS 'Returns all available subscription tiers with pricing';