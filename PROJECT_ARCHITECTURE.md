# Sierra Myco Lab — Project Architecture

Inventory and order management system for a mushroom farm. Vanilla JavaScript + Tailwind CSS frontend, Supabase (PostgreSQL + Auth + Edge Functions) backend. Multi-tenant (`organization_id`), with Square and Etsy OAuth integrations and an optional Gemini AI assistant.

This document is a living map of the codebase for future work — update it when the architecture changes (new tables, new edge functions, new top-level JS modules).

## 1. Frontend Structure

- **`index.html`** (~3,300 lines) — single-page app shell. Loads Supabase JS v2 via CDN (`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`), then `js/app.js` as an ES module. All views/modals live in this one HTML file and are shown/hidden by JS, not routed.
- **`js/config.js`** — static config: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, Square `APPLICATION_ID`, Gemini config. Committed to source (expected for a public anon key; RLS is the real access boundary — see §3).
- **`js/db.js`** (~2,400 lines) — the primary data-access layer.
  - Owns the singleton Supabase client (`isSupabaseConfigured()` → `createClient(...)`).
  - CRUD for items/containers, supplies, organizations, locations, racks, fresh produce.
  - Auth helpers (sign in/up/out, session, org membership).
  - A hand-rolled local-first ↔ cloud sync engine: local `db.items` array is the working copy, changes are pushed to Supabase via debounced `scheduleCloudPush()` / `pushLocalChangesToCloud()`, and reconciled via `syncItemsWithCloud()`.
  - Field-mapping layer between local item shape and the `items` table (e.g. `label`→`name`), plus an `ALLOWED_COLUMNS` whitelist and `KEY_ALIASES` map that sanitize data before upload — a defensive substitute for a real ORM/schema validator.
- **`js/app.js`** (~3,950 lines) — main app logic: dashboard rendering, event wiring, container lifecycle (inoculation → colonization → fruiting → harvest), rack/preset management, bulk actions.
- **`js/modals.js`** (~4,150 lines) — all modal dialogs: item detail (`openModal`), delete flows, org settings, presets, tab-switching UIs.
- **`js/utils.js`** (~1,250 lines) — shared helpers: toasts, formatting, stock-warning checks, etc.
- **`js/sales.js`** — customers and orders CRUD, Square payment-payload construction, Sales page rendering. Calls Supabase directly (`.from('customers')`, `.from('orders')`) rather than through `db.js`.
- **`js/etsy.js`** — Etsy OAuth connect/disconnect UI, listings import trigger, SKU-mapping modal. Mixes edge-function calls (OAuth start, import) with direct table reads (integration status, SKU mappings).
- **`js/ai.js`** — Gemini 2.5 Flash chat assistant. Calls the Gemini REST API **directly from the browser** (API key in `localStorage`, not proxied through an edge function — see roadmap note in §5). Has a small JSON "action payload" system that lets the assistant create items / update stage / log harvest by mutating local `db.items` directly (does not go through the Supabase sync path the same way manual edits do).
- **`js/camera.js`** — four separate QR/barcode scanner instances (standalone, G2G, Spawn-to-Bulk, Record-Sale) using `html5-qrcode`, each with its own copy of the scanned-code prefix-parsing logic.
- **`js/recipes.js`** — pure client-side data module (default recipe library + custom recipes). No backend calls; custom recipes are `localStorage`-only and not organization-scoped.

**Data-access pattern**: shared-singleton-client, but not a strict repository pattern — `db.js` is the primary wrapper, while `sales.js`/`etsy.js`/`app.js` also issue `.from(...)` queries directly against the same client.

## 2. Database Schema

Multi-tenancy is via `organization_id`, introduced in migration 006 and propagated to almost every table thereafter. Enforcement is **both** RLS policies (keyed off `organization_members` membership, mostly via the `is_org_member(org_id)` SECURITY DEFINER helper) **and** application-level `.eq('organization_id', ...)` filtering in `db.js` — the app-layer filter is redundant when RLS is correct, but becomes the *only* protection when RLS is missing or wrong.

**⚠️ The migration files in `supabase/migrations/` do not reliably describe the live database.** `supabase migration list` shows the remote project has never recorded migrations 001–020 as applied — this schema was built and repeatedly hand-patched via the Supabase SQL editor/dashboard over time, not through the tracked migration flow. A direct `pg_policies`/`information_schema` query against the linked project (2026-08-23) found real drift: `fresh_produce_inventory` does not exist in production at all (migration 015 was apparently never actually run), while `containers`, `feedback`, `sales_orders`, `sales_order_items`, and `strains` exist in production and appear in **no migration file whatsoever**. **Treat the table below as a snapshot to re-verify against the live schema (`select table_name from information_schema.tables where table_schema='public'`, plus `pg_policies`) before relying on it for anything security-sensitive — don't assume the migrations folder is current.**

| Table | Purpose | Key relationships |
|---|---|---|
| `profiles` | 1:1 with `auth.users`; subscription/plan/billing | `id = auth.users.id` |
| `items` | Core inventory: grain/bulk/agar containers, lineage via self-referencing `parent_id` | `organizations`, `locations`, `auth.users`, self |
| `organizations` | Tenant root; also holds Square OAuth tokens | — |
| `organization_members` | User↔org membership + role (owner/admin/member) | `organizations`, `auth.users` |
| `locations` | Physical storage locations, categorized | `organizations` |
| `racks` | Shelving within a location | `organizations`, `locations` |
| `customers` | Sales contacts | `organizations` |
| `orders`, `sales_orders`, `sales_order_items` | Sales — `orders` (jsonb `line_items`) and a separate `sales_orders`/`sales_order_items` pair both exist live; relationship between the two designs is unclear and worth clarifying before building on either | `organizations`, `customers` |
| `supplies` | Consumables inventory | `organizations` |
| `strains` | Org-scoped strain library | `organizations` |
| `etsy_integrations` | Etsy OAuth tokens + PKCE state, one per user | `auth.users`, `organizations` (scoped by `user_id`, not `organization_id` — deliberate asymmetry vs. Square) |
| `sku_mappings` | Etsy listing ↔ inventory item mapping, deduction quantity | `auth.users`, `organizations`; **no FK** to `items` |
| `feedback` | Public feedback/roadmap board | intentionally `SELECT`-open to everyone — not a bug |
| `containers` | Legacy/vestigial, 0 rows live, no `organization_id` column | referenced only as a best-effort cleanup target in `db.js` |
| `fresh_produce_inventory` | **Does not exist in production** despite having a migration file | — |

**Known schema quirks** (documented so future work doesn't "fix" them by accident or get bitten by them):
- `profiles.plan` and `profiles.subscription_tier` are two overlapping columns per the migration files — worth confirming against the live `profiles` schema, which may have diverged like everything else in this section.
- `sku_mappings.inventory_id` (UUID) and `sku_mappings.inventory_item_id` (TEXT, added later) represent the same concept with inconsistent types and no FK constraint.
- Two migration files are both numbered `020` (`020_add_sku_mapping_columns.sql`, `020_update_supplies_category_check.sql`) — harmless in practice since neither has ever been applied via tracked migration flow, but rename before ever relying on `supabase db push`.
- **RLS lockdown (2026-08-23, migration `021_lockdown_open_rls_policies.sql`, applied directly via `supabase db query -f` since tracked migration history doesn't reflect this database)**: `organizations` had a `SELECT ... USING (true)` policy open to `anon`+`authenticated`, exposing every org's plaintext `square_access_token`/`square_refresh_token` to anyone with the public anon key — fixed. `customers` and `orders` each had a `FOR ALL USING (true)` policy exposing all orgs' customer PII and sales data — fixed, now scoped via `is_org_member(organization_id)`. `profiles` had an open `SELECT` exposing every user's billing fields — fixed, now `auth.uid() = id`. `containers` had a single open `DELETE` policy — fixed, now `auth.uid() = user_id`. `supplies` was found to already be correctly org-scoped in production (patched previously, outside migration tracking, under different policy names than migration file 012 shows). The only remaining `USING (true)` policy anywhere in the schema is `feedback`'s public `SELECT`, which is an intentional public board, not a bug.
- `items` RLS is scoped by `auth.uid() = user_id`, not organization membership — meaning two teammates in the same org likely cannot see each other's items via RLS today. This looks like a functional gap worth confirming with the team, not something this pass changed.

## 3. Supabase Edge Functions

All in `supabase/functions/`, Deno runtime, all wildcard CORS with OPTIONS preflight handling. `supabase/functions/_shared/auth.ts` holds two helpers used by the functions below:
- `resolveAuthorizedOrg(req, supabaseUrl, serviceRoleKey, claimedOrgId?)` — verifies the caller's JWT and confirms `organization_members` membership before trusting any organization id. Every function that scopes an action to an organization must resolve `organization_id` through this rather than trusting a client-supplied body/query value.
- `signOAuthState(orgId, secret)` / `verifyOAuthState(state, secret)` — HMAC-signs (and later verifies) the org id embedded in an OAuth `state` param, using `SQUARE_APPLICATION_SECRET` as the signing key, with a 10-minute expiry. Prevents a client from forging `state` to bind a Square connection to an org they aren't a member of.

| Function | Purpose | Auth model |
|---|---|---|
| `square-oauth` | Square OAuth start (POST-only, `action: "start"`) + callback (GET) + disconnect/exchange; writes tokens to `organizations` | `resolveAuthorizedOrg` on every POST action; callback trusts only the HMAC-signed `state`, not a query/body org id. GET-with-no-code initiation was removed — the frontend now calls the authenticated POST `start` action and navigates to the URL it returns. |
| `square-create-payment` | Charges a customer via a connected Square account | `resolveAuthorizedOrg` before looking up the org's Square token; `orders` update (if `order_id` given) is also scoped `.eq('organization_id', verifiedOrgId)` |
| `etsy-auth-start` | Begins Etsy OAuth (PKCE), persists `state`/verifier to `etsy_integrations` | User id is derived strictly from the verified JWT (never the request body); an optional client-supplied `organization_id` is only accepted after confirming membership |
| `etsy-auth-callback` | Etsy OAuth callback; exchanges code for tokens, looks up integration by `state` | `state`-keyed lookup (CSRF protection only, not an authz credential) — **not yet hardened with an expiry check**, see roadmap. Has verbose `console.error`/`console.log` at every step (token exchange, shop lookup, DB write) added 2026-08-23 after a silent-failure incident, see note below. |
| `etsy-import-listings` | Imports the connected shop's listings for SKU mapping | JWT-verified user id (never client-supplied); `organization_id` is always read from that user's own `etsy_integrations` row (never from client input) and, as of 2026-08-24, re-checked against live `organization_members` membership before writing `sku_mappings`, in case membership was revoked after the Etsy connection was made |
| `etsy-poll-orders` | Polls all connected shops for new orders, deducts stock via `sku_mappings` | System job, not a user request — invoked by `pg_cron` every 15 minutes via `pg_net` sending `Authorization: Bearer <service_role_key>`. As of 2026-08-24 the function itself checks that header against `SUPABASE_SERVICE_ROLE_KEY`; before that fix it had **no check at all** (platform `verify_jwt` is `false` here since the cron bearer isn't a normal user JWT), so anyone who found the URL could trigger a full poll/write cycle across every organization with zero credentials |

All functions read `SUPABASE_SERVICE_ROLE_KEY` from `Deno.env.get(...)` (never hardcoded) to bypass RLS for background writes — this is correct and expected; the JWT/membership binding above is what actually enforces tenant isolation on top of it. Deployed via `supabase functions deploy <name> --project-ref wsalxxsjnxptoeduwfqw` (Docker not required for this CLI version/flow).

**Etsy `x-api-key` incident (2026-08-23)**: Etsy connections were completing (tokens saved to `etsy_integrations`) but the UI stayed "Not Connected" because `etsy_shop_id` was never populated. Root cause had nothing to do with RLS or the Phase 2 auth hardening — Etsy enforced a policy change (effective Feb 9, 2026) requiring every v3 REST call's `x-api-key` header to be `<keystring>:<shared secret>` instead of just the keystring; this codebase only ever stored `ETSY_KEYSTRING`, so the shop-lookup, listings-import, and order-polling calls all started 403ing with `"Shared secret is required in x-api-key header"` (the OAuth token endpoint itself doesn't need it, which is why token exchange kept working and masked the failure). Fixed in `etsy-auth-callback`, `etsy-import-listings`, and `etsy-poll-orders` by reading a new secret, **`ETSY_SHARED_SECRET`** (set via `supabase secrets set ETSY_SHARED_SECRET=<value> --project-ref wsalxxsjnxptoeduwfqw`, value from the Etsy app's page at etsy.com/developers/your-apps), and sending `x-api-key: <ETSY_KEYSTRING>:<ETSY_SHARED_SECRET>` when it's set (falls back to keystring-only with a loud `console.error` if not). The secret has been set in production as of 2026-08-24.

## 4. Integration Architecture

- **Square**: OAuth tokens stored directly on `organizations` (plaintext columns). Payment creation goes through `square-create-payment`, which reads the org's stored access token server-side.
- **Etsy**: dedicated `etsy_integrations` table (plaintext tokens + PKCE artifacts), scoped by `user_id`. `sku_mappings` links Etsy listings to local inventory for automatic stock deduction on sale, driven by the `etsy-poll-orders` cron job. Every non-OAuth Etsy v3 REST call requires both `ETSY_KEYSTRING` and `ETSY_SHARED_SECRET` (as `x-api-key: keystring:secret`) as of Etsy's Feb 2026 policy change — see the incident note in §3.
- **Gemini AI** (`js/ai.js`): the one integration that is **not** proxied through an edge function — the API key lives client-side (`localStorage`) and the browser calls Google's REST API directly. Architecturally inconsistent with Square/Etsy; flagged as a roadmap item, not yet fixed.

## 5. Known Roadmap Items (not yet actioned)

- Add an expiry check to `etsy-auth-callback`'s `state` lookup (currently unbounded; a captured/stale Etsy `state` remains usable indefinitely).
- `etsy-poll-orders`'s new Authorization check is a plain `===` string compare against the service role key, not constant-time — low real-world risk (it's a long random secret, not attacker-guessable character-by-character in practice) but worth swapping for a constant-time compare if this pattern gets reused elsewhere.
- Confirm whether `orders` or the separate `sales_orders`/`sales_order_items` pair is the actual system of record for sales — both exist live and it's unclear if one is dead weight or if they're intentionally different things.
- Decide whether `items` RLS should move from `auth.uid() = user_id` to organization-membership scoping, so teammates in the same org can see each other's inventory.
- Move the Gemini AI integration behind an edge function so the API key is never client-side.
- `js/sales.js` `updateCustomer`/`deleteCustomer` only touch local state, never Supabase — customer edits/deletes don't currently sync remotely.
- Consolidate the five near-duplicate delete-then-sync blocks in `modals.js` (local state is filtered even when the cloud delete failed, which can make an item appear deleted when it isn't).
- Consolidate the four duplicated QR-scanning prefix-parsing blocks in `js/camera.js`.
- `js/recipes.js` custom recipes are `localStorage`-only, not organization-scoped or shared across a team.
