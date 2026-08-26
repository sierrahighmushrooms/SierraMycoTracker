// Supabase Edge Function: etsy-import-listings
// Imports active listings from Etsy API v3, supports auto-token refresh & 250ms rate limit delay

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

// Helper: Sleep delay for rate-limiting (5 QPS max)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper: Convert an Etsy Money object ({ amount, divisor, currency_code }) to a decimal number
function parseMoney(money: any): number | null {
  if (!money || typeof money.amount !== "number" || typeof money.divisor !== "number" || money.divisor === 0) {
    return null;
  }
  return money.amount / money.divisor;
}

// Helper: Extract the primary listing image thumbnail URL from an Etsy listing's
// "images" array (populated via includes=Images) or the legacy MainImage field
function extractImageUrl(listing: any): string | null {
  const primaryImage = Array.isArray(listing.images) && listing.images.length > 0
    ? listing.images[0]
    : listing.MainImage;
  if (!primaryImage) return null;
  return primaryImage.url_75x75 || primaryImage.url_170x135 || primaryImage.url_fullxfull || null;
}

// Helper: Build a human-readable variation label from a product's property_values
// (e.g. [{ property_name: "Color", values: ["Blue"] }, { property_name: "Size", values: ["Large"] }] -> "Blue / Large")
function buildVariationLabel(propertyValues: any[]): string {
  if (!Array.isArray(propertyValues) || propertyValues.length === 0) return "";
  return propertyValues
    .map((pv: any) => (Array.isArray(pv.values) ? pv.values.join("/") : ""))
    .filter((v: string) => v)
    .join(" / ");
}

// Helper: Refresh access token if expired
async function getValidEtsyAccessToken(supabaseAdmin: any, integration: any, etsyClientId: string): Promise<string> {
  const expiresAt = new Date(integration.expires_at).getTime();
  const now = Date.now();

  // If token expires in less than 2 minutes, refresh it
  if (now > expiresAt - 120000) {
    console.log("Etsy access token expiring/expired. Refreshing token...");
    const refreshResp = await fetch("https://api.etsy.com/v3/public/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: etsyClientId,
        refresh_token: integration.refresh_token
      })
    });

    const refreshData = await refreshResp.json();
    if (!refreshResp.ok || refreshData.error) {
      throw new Error(`Token refresh failed: ${refreshData.error_description || refreshData.error}`);
    }

    const newExpiresAt = new Date(Date.now() + (refreshData.expires_in || 3600) * 1000).toISOString();

    await supabaseAdmin
      .from("etsy_integrations")
      .update({
        access_token: refreshData.access_token,
        refresh_token: refreshData.refresh_token,
        expires_at: newExpiresAt,
        updated_at: new Date().toISOString()
      })
      .eq("id", integration.id);

    return refreshData.access_token;
  }

  return integration.access_token;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const etsyClientId = Deno.env.get("ETSY_KEYSTRING") || "defw08dcohinep37tx3vdgmm";
    // Etsy's Feb 9 2026 shared-secret enforcement requires "x-api-key" as
    // "<keystring>:<shared secret>" on v3 REST calls, or they 403.
    const etsySharedSecret = Deno.env.get("ETSY_SHARED_SECRET") || "";
    if (!etsySharedSecret) {
      console.error("etsy-import-listings: ETSY_SHARED_SECRET is not set -- Etsy v3 REST calls will 403.");
    }
    const etsyApiKeyHeader = etsySharedSecret ? `${etsyClientId}:${etsySharedSecret}` : etsyClientId;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Authenticate caller
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized user" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Retrieve integration for user
    const { data: integration, error: integrationError } = await adminClient
      .from("etsy_integrations")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (integrationError || !integration || !integration.etsy_shop_id) {
      return new Response(JSON.stringify({ error: "No connected Etsy shop found for this account. Please connect Etsy first." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // organization_id is never accepted from the client here -- it always
    // comes from this user's own etsy_integrations row (looked up by the
    // JWT-verified user.id above), and that row's organization_id was only
    // ever set by etsy-auth-start's own verified membership check. As
    // defense in depth, re-confirm membership hasn't been revoked since
    // the Etsy connection was made, so sku_mappings can't be written under
    // an organization the caller is no longer part of.
    if (integration.organization_id) {
      const { data: membership } = await adminClient
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("organization_id", integration.organization_id)
        .maybeSingle();

      if (!membership) {
        console.error("etsy-import-listings: caller is no longer a member of the organization bound to their Etsy integration.", {
          userId: user.id,
          organizationId: integration.organization_id
        });
        return new Response(JSON.stringify({ error: "You are no longer authorized for the organization linked to this Etsy connection." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // Ensure valid access token
    const accessToken = await getValidEtsyAccessToken(adminClient, integration, etsyClientId);
    const shopId = integration.etsy_shop_id;

    // Fetch active listings with pagination (limit 100 per page) and 250ms rate-limit pause
    let offset = 0;
    const limit = 100;
    let totalImported = 0;
    let hasMore = true;
    const allListings: any[] = [];

    while (hasMore) {
      const url = `https://openapi.etsy.com/v3/application/shops/${shopId}/listings/active?limit=${limit}&offset=${offset}&includes=Inventory,Images`;
      
      const res = await fetch(url, {
        headers: {
          "x-api-key": etsyApiKeyHeader,
          "Authorization": `Bearer ${accessToken}`
        }
      });

      if (!res.ok) {
        const errorBody = await res.text();
        console.error("Etsy API Error fetching listings:", res.status, errorBody);
        throw new Error(`Etsy API returned status ${res.status}: ${errorBody}`);
      }

      const data = await res.json();
      const results = data.results || [];
      allListings.push(...results);

      totalImported += results.length;

      // Check if more results exist
      if (results.length < limit || totalImported >= (data.count || 0)) {
        hasMore = false;
      } else {
        offset += limit;
        // Rate-limit delay: 250ms to adhere to 5 QPS Personal Access tier
        await sleep(250);
      }
    }

    // Save SKU mappings to database
    const mappingsToUpsert: any[] = [];

    for (const listing of allListings) {
      const listingId = String(listing.listing_id);
      const title = listing.title || "";
      const imageUrl = extractImageUrl(listing);
      const products = listing.inventory?.products || [];

      if (products.length > 0) {
        for (const prod of products) {
          const productId = String(prod.product_id);
          const sku = prod.sku || null;
          const offerings = prod.offerings || [];
          const quantity = offerings.reduce((acc: number, curr: any) => acc + (curr.quantity || 0), 0);
          const offeringPrice = offerings.find((o: any) => o.price)?.price;
          const price = parseMoney(offeringPrice) ?? parseMoney(listing.price);
          const variationLabel = buildVariationLabel(prod.property_values);
          const itemTitle = variationLabel ? `${title} — ${variationLabel}` : title;

          mappingsToUpsert.push({
            user_id: user.id,
            organization_id: integration.organization_id || null,
            listing_id: listingId,
            product_id: productId,
            sku: sku,
            title: itemTitle,
            price: price,
            image_url: imageUrl,
            etsy_quantity: quantity,
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      } else {
        // Fallback for listings without granular products array
        mappingsToUpsert.push({
          user_id: user.id,
          organization_id: integration.organization_id || null,
          listing_id: listingId,
          product_id: null,
          sku: listing.sku || null,
          title: title,
          price: parseMoney(listing.price),
          image_url: imageUrl,
          etsy_quantity: listing.quantity || 0,
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
    }

    // Upsert mappings in batches of 100
    for (let i = 0; i < mappingsToUpsert.length; i += 100) {
      const batch = mappingsToUpsert.slice(i, i + 100);
      const { error: upsertErr } = await adminClient
        .from("sku_mappings")
        .upsert(batch, { onConflict: "user_id,listing_id,sku" });

      if (upsertErr) {
        console.error("Error upserting SKU mappings batch:", upsertErr);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      total_listings_imported: allListings.length,
      total_skus_mapped: mappingsToUpsert.length
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("etsy-import-listings exception:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});