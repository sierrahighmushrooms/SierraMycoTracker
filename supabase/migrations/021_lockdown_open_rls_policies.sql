-- Migration: 021_lockdown_open_rls_policies.sql
-- Description: The live database has drifted from this repo's migration
-- history (supabase migration_history has never recorded 001-020 as
-- applied here — this schema was built by hand over time). A direct audit
-- of pg_policies on the linked project found several tables with fully
-- permissive RLS policies (USING (true) / WITH CHECK (true), open to the
-- anon role) despite carrying an organization_id/user_id column meant to
-- scope them:
--
--   - organizations: SELECT was open to anon+authenticated, exposing
--     every org's plaintext square_access_token/square_refresh_token to
--     any caller holding only the public anon key.
--   - customers, orders: FOR ALL was open to anon+authenticated, exposing
--     every org's customer PII and sales data to any caller.
--   - profiles: SELECT was open to anon+authenticated, exposing every
--     user's profile/billing fields to any caller.
--   - containers: DELETE was open to public with no other policies
--     defined (a 0-row legacy table referenced defensively by db.js as a
--     best-effort cleanup target).
--
-- supplies was found to already be correctly org-scoped in production
-- (fixed previously outside of migration tracking) and
-- fresh_produce_inventory does not exist in production at all, so neither
-- is touched here.

-- ---------------------------------------------------------------------
-- organizations: remove the open SELECT/INSERT policies, keep the
-- existing membership-scoped SELECT ("Users can view organizations they
-- belong to") and the existing "Authenticated users can create an
-- organization" INSERT policy, which already cover legitimate access.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow read access for organizations" ON public.organizations;
DROP POLICY IF EXISTS "Allow insert access for organizations" ON public.organizations;

-- ---------------------------------------------------------------------
-- customers: replace the open FOR ALL policy with organization
-- membership scoping, matching the convention already used by
-- locations/strains (is_org_member()).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow full access for customers" ON public.customers;

CREATE POLICY "Members can view and manage customers in their org"
    ON public.customers
    FOR ALL
    USING (is_org_member(organization_id))
    WITH CHECK (is_org_member(organization_id));

-- ---------------------------------------------------------------------
-- orders: same fix as customers.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow full access for orders" ON public.orders;

CREATE POLICY "Members can view and manage orders in their org"
    ON public.orders
    FOR ALL
    USING (is_org_member(organization_id))
    WITH CHECK (is_org_member(organization_id));

-- ---------------------------------------------------------------------
-- profiles: every app query already scopes this to the caller's own row
-- (.eq('id', user.id)); restrict RLS to match instead of allowing anyone
-- to read every user's profile/billing fields.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated read on profiles" ON public.profiles;

CREATE POLICY "Users can view their own profile"
    ON public.profiles
    FOR SELECT
    USING (auth.uid() = id);

-- ---------------------------------------------------------------------
-- containers: legacy/empty table with a single open DELETE policy and no
-- other policies. Scope it to the owning user, matching the items table's
-- own auth.uid() = user_id convention, so db.js's best-effort legacy
-- cleanup still works for a user's own rows without allowing anyone to
-- delete anyone else's.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Enable delete access" ON public.containers;

CREATE POLICY "Users can manage their own containers"
    ON public.containers
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
