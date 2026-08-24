// Shared helpers for binding a request to an authenticated user's verified
// organization membership, and for signing/verifying OAuth `state` values
// so they can't be forged by a client to target another organization.
//
// Every edge function that reads/writes data scoped to an organization_id
// must resolve that organization_id through resolveAuthorizedOrg() rather
// than trusting a client-supplied body/query value directly.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface OrgAuthResult {
  userId: string;
  organizationId: string;
}

export interface OrgAuthError {
  error: string;
  status: number;
}

export function isOrgAuthError(result: OrgAuthResult | OrgAuthError): result is OrgAuthError {
  return (result as OrgAuthError).error !== undefined;
}

/**
 * Verifies the caller's JWT (from the Authorization header) and, if
 * claimedOrgId is supplied, confirms the user is a member of that
 * organization via organization_members. If claimedOrgId is omitted, the
 * user's first membership is used. Returns an error object (never throws)
 * on any failure so callers can respond with the right status code.
 */
export async function resolveAuthorizedOrg(
  req: Request,
  supabaseUrl: string,
  serviceRoleKey: string,
  claimedOrgId?: string | null
): Promise<OrgAuthResult | OrgAuthError> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { error: "Missing Authorization header", status: 401 };
  }

  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") || "", {
    global: { headers: { Authorization: authHeader } }
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return { error: "Invalid or expired session", status: 401 };
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: memberships, error: memberError } = await adminClient
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id);

  if (memberError) {
    return { error: "Failed to verify organization membership", status: 500 };
  }

  const orgIds = (memberships || []).map((m: { organization_id: string }) => m.organization_id);
  if (orgIds.length === 0) {
    return { error: "User is not a member of any organization", status: 403 };
  }

  if (claimedOrgId) {
    if (!orgIds.includes(claimedOrgId)) {
      return { error: "You are not authorized to act on this organization", status: 403 };
    }
    return { userId: user.id, organizationId: claimedOrgId };
  }

  return { userId: user.id, organizationId: orgIds[0] };
}

async function hmacHex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

/**
 * Produces an OAuth `state` value that binds an organization id to this
 * specific authorization request via an HMAC signature, so the callback
 * can verify it wasn't forged by a client and hasn't expired.
 */
export async function signOAuthState(organizationId: string, secret: string): Promise<string> {
  const nonce = crypto.randomUUID();
  const ts = Date.now().toString();
  const sig = await hmacHex(`${organizationId}|${ts}|${nonce}`, secret);
  return `${organizationId}|${ts}|${nonce}|${sig}`;
}

/**
 * Verifies a state value produced by signOAuthState. Returns the bound
 * organization id if the signature is valid and the state hasn't expired,
 * or null otherwise.
 */
export async function verifyOAuthState(state: string | null, secret: string): Promise<string | null> {
  if (!state) return null;
  const parts = state.split("|");
  if (parts.length !== 4) return null;
  const [organizationId, ts, nonce, sig] = parts;
  if (!organizationId || !ts || !nonce || !sig) return null;

  const expectedSig = await hmacHex(`${organizationId}|${ts}|${nonce}`, secret);
  if (!timingSafeEqual(sig, expectedSig)) return null;

  const age = Date.now() - Number(ts);
  if (!Number.isFinite(age) || age < 0 || age > OAUTH_STATE_TTL_MS) return null;

  return organizationId;
}
