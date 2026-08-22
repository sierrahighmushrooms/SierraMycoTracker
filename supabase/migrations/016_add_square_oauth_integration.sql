-- Migration: Add Square OAuth & Merchant connection columns to organizations
-- Description: Stores Square merchant details, tokens, and authorization metadata per organization.

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS square_merchant_id TEXT,
ADD COLUMN IF NOT EXISTS square_access_token TEXT,
ADD COLUMN IF NOT EXISTS square_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS square_token_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS square_connected_at TIMESTAMPTZ;

-- Index for merchant lookup
CREATE INDEX IF NOT EXISTS idx_organizations_square_merchant_id ON public.organizations(square_merchant_id);

-- Reload schema cache
NOTIFY pgrst, 'reload schema';