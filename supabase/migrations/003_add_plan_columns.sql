-- Migration: Add plan / container_limit / role columns to profiles
-- Description: The dashboard plan badge reads `plan`, `container_limit`, and
--              `role` from public.profiles (falling back to
--              `subscription_tier`). This migration:
--                1) Adds those columns idempotently
--                2) Backfills `plan` from `subscription_tier`
--                3) Keeps `subscription_tier` in sync when `plan` changes
--                4) Recreates get_container_usage() to prefer `plan` and
--                   honor per-user `container_limit` overrides
--                5) Updates the check_container_limit() enforcement trigger
--                   to use the same source of truth

-- ============================================================================
-- 1. ADD PLAN COLUMNS TO PROFILES
-- ============================================================================

-- plan: canonical plan name shown in the UI badge (free/grower/commercial/pro/admin)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'plan'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN plan TEXT;
  END IF;
END $$;

-- container_limit: per-user override of the tier-derived active container cap
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'container_limit'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN container_limit INTEGER;
  END IF;
END $$;

-- role: e.g. 'admin' — admins are treated as PRO/unlimited in the UI
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN role TEXT;
  END IF;
END $$;

-- Backfill plan from subscription_tier for existing rows so both agree.
UPDATE public.profiles
SET plan = subscription_tier
WHERE plan IS NULL AND subscription_tier IS NOT NULL;

-- ============================================================================
-- 2. KEEP subscription_tier IN SYNC WITH plan
-- ============================================================================
-- When plan is set to a value allowed by the subscription_tier CHECK
-- constraint, mirror it into subscription_tier so legacy consumers agree.
-- Values like 'pro'/'admin' are not mirrored (CHECK constraint), but the
-- RPC/trigger below read `plan` first, so they are still honored.

CREATE OR REPLACE FUNCTION public.sync_plan_to_subscription_tier()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.plan IS NOT NULL
     AND LOWER(NEW.plan) IN ('free', 'grower', 'commercial')
     AND NEW.subscription_tier IS DISTINCT FROM LOWER(NEW.plan) THEN
    NEW.subscription_tier := LOWER(NEW.plan);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_plan_to_subscription_tier ON public.profiles;
CREATE TRIGGER trg_sync_plan_to_subscription_tier
  BEFORE INSERT OR UPDATE OF plan ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_plan_to_subscription_tier();

-- Register the PRO tier so tier lookups never miss it.
INSERT INTO public.subscription_tiers (tier_name, max_active_containers, display_name)
VALUES ('pro', 999999, 'PRO')
ON CONFLICT (tier_name) DO UPDATE SET
  max_active_containers = EXCLUDED.max_active_containers,
  display_name = EXCLUDED.display_name;

-- ============================================================================
-- 3. HELPER: RESOLVE A USER'S EFFECTIVE PLAN + LIMIT
-- ============================================================================
-- Single source of truth used by both the usage RPC and the insert trigger.
-- Priority: profiles.plan -> profiles.subscription_tier -> 'free'.
-- Limit:    profiles.container_limit -> subscription_tiers lookup
--           (pro/admin are always unlimited).

CREATE OR REPLACE FUNCTION public.resolve_user_plan(user_uuid UUID)
RETURNS TABLE (plan TEXT, max_limit INTEGER, user_role TEXT) AS $$
DECLARE
  v_plan TEXT;
  v_role TEXT;
  v_limit_override INTEGER;
  v_max_limit INTEGER;
BEGIN
  SELECT LOWER(COALESCE(NULLIF(TRIM(p.plan), ''), p.subscription_tier, 'free')),
         p.container_limit,
         LOWER(p.role)
  INTO v_plan, v_limit_override, v_role
  FROM public.profiles p
  WHERE p.id = user_uuid;

  IF v_plan IS NULL THEN
    v_plan := 'free';
  END IF;

  IF v_limit_override IS NOT NULL THEN
    -- Explicit per-user override always wins.
    v_max_limit := v_limit_override;
  ELSIF v_plan IN ('pro', 'admin') OR v_role = 'admin' THEN
    v_max_limit := 999999;
  ELSE
    SELECT st.max_active_containers INTO v_max_limit
    FROM public.subscription_tiers st
    WHERE st.tier_name = v_plan;

    IF v_max_limit IS NULL THEN
      v_max_limit := 100;
    END IF;
  END IF;

  plan := v_plan;
  max_limit := v_max_limit;
  user_role := v_role;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.resolve_user_plan(UUID) TO authenticated;

-- ============================================================================
-- 4. RECREATE get_container_usage() TO HONOR plan / container_limit
-- ============================================================================

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
  v_stage_expr TEXT;
BEGIN
  -- Resolve effective plan + limit (plan wins over subscription_tier).
  SELECT r.plan, r.max_limit
  INTO v_tier, v_max_limit
  FROM public.resolve_user_plan(user_uuid) r;

  IF v_tier IS NULL THEN
    v_tier := 'free';
    v_max_limit := 100;
  END IF;

  -- Billing fields still come from the profiles row.
  SELECT p.subscription_status,
         p.lemonsqueezy_subscription_id,
         p.lemonsqueezy_customer_portal_url,
         p.subscription_current_period_end
  INTO v_subscription_status,
       v_lemonsqueezy_subscription_id,
       v_lemonsqueezy_customer_portal_url,
       v_subscription_current_period_end
  FROM public.profiles p
  WHERE p.id = user_uuid;

  -- Count active containers. The client writes the `stage` column directly;
  -- older schemas stored stage inside a jsonb `payload` column. Build the
  -- stage expression defensively so both schemas work.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'items' AND column_name = 'stage'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'items' AND column_name = 'payload'
    ) THEN
      v_stage_expr := 'COALESCE(i.stage, i.payload->>''stage'', ''Preparation'')';
    ELSE
      v_stage_expr := 'COALESCE(i.stage, ''Preparation'')';
    END IF;
  ELSE
    v_stage_expr := 'COALESCE(i.payload->>''stage'', ''Preparation'')';
  END IF;

  EXECUTE format(
    'SELECT COUNT(*) FROM public.items i WHERE i.user_id = %L AND %s NOT IN (SELECT UNNEST(%L::text[]))',
    user_uuid, v_stage_expr, v_inactive_stages
  ) INTO v_active_count;

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

GRANT EXECUTE ON FUNCTION public.get_container_usage(UUID) TO authenticated;

-- ============================================================================
-- 5. UPDATE ENFORCEMENT TRIGGER TO USE THE SAME SOURCE OF TRUTH
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_container_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_max_limit INTEGER;
  v_active_count INTEGER;
  v_inactive_stages TEXT[] := ARRAY['Archived', 'Spent', 'Contaminated'];
  v_stage_expr TEXT;
BEGIN
  -- Effective limit for this user (plan/container_limit aware).
  SELECT r.max_limit INTO v_max_limit
  FROM public.resolve_user_plan(NEW.user_id) r;

  IF v_max_limit IS NULL THEN
    v_max_limit := 100;
  END IF;

  -- Count active containers (same defensive stage expression as the RPC).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'items' AND column_name = 'stage'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'items' AND column_name = 'payload'
    ) THEN
      v_stage_expr := 'COALESCE(i.stage, i.payload->>''stage'', ''Preparation'')';
    ELSE
      v_stage_expr := 'COALESCE(i.stage, ''Preparation'')';
    END IF;
  ELSE
    v_stage_expr := 'COALESCE(i.payload->>''stage'', ''Preparation'')';
  END IF;

  EXECUTE format(
    'SELECT COUNT(*) FROM public.items i WHERE i.user_id = %L AND %s NOT IN (SELECT UNNEST(%L::text[]))',
    NEW.user_id, v_stage_expr, v_inactive_stages
  ) INTO v_active_count;

  IF v_active_count >= v_max_limit THEN
    RAISE EXCEPTION 'Active container limit reached for your current plan. Upgrade to add more containers.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON COLUMN public.profiles.plan IS 'Canonical plan name shown in the UI badge: free, grower, commercial, pro, admin';
COMMENT ON COLUMN public.profiles.container_limit IS 'Per-user override of the active container limit (NULL = derive from plan/tier)';
COMMENT ON COLUMN public.profiles.role IS 'User role, e.g. admin (treated as PRO/unlimited in the UI)';
COMMENT ON FUNCTION public.resolve_user_plan(UUID) IS 'Single source of truth for a user''s effective plan, container limit, and role';
COMMENT ON FUNCTION public.get_container_usage(UUID) IS 'Returns container usage and subscription billing info, honoring plan/container_limit overrides';