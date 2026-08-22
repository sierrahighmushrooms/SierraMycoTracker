// Supabase Edge Function: etsy-poll-orders
// Polls Etsy shop receipts, records orders, and deducts local inventory items.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getValidEtsyAccessToken(supabaseAdmin: any, integration: any, etsyClientId: string): Promise<string> {
  const expiresAt = new Date(integration.expires_at).getTime();
  const now = Date.now();

  if (now > expiresAt - 120000) {
    const refreshResp = await fetch("https://api.etsy.com/v3/public/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: etsyClientId,
        refresh_token: integration.refresh_token
      })
    });

    const refreshData = await refreshResp.json();
    if (!refreshResp.ok || refreshData.error) {
      throw new Error(`Token refresh failed for integration ${integration.id}: ${refreshData.error_description || refreshData.error}`);
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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const etsyClientId = Deno.env.get("ETSY_KEYSTRING") || "defw08dcohinep37tx3vdgmm";

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all connected Etsy integrations
    const { data: integrations, error: intError } = await adminClient
      .from("etsy_integrations")
      .select("*")
      .not("etsy_shop_id", "is", null);

    if (intError) {
      throw intError;
    }

    const syncSummary: any[] = [];

    for (const integration of (integrations || [])) {
      try {
        const accessToken = await getValidEtsyAccessToken(adminClient, integration, etsyClientId);
        const shopId = integration.etsy_shop_id;

        // Fetch recent receipts (last 50 orders)
        const receiptsUrl = `https://openapi.etsy.com/v3/application/shops/${shopId}/receipts?limit=50&sort_on=created&sort_order=desc&includes=Transactions`;
        
        const res = await fetch(receiptsUrl, {
          headers: {
            "x-api-key": etsyClientId,
            "Authorization": `Bearer ${accessToken}`
          }
        });

        if (!res.ok) {
          console.error(`Failed to fetch receipts for shop ${shopId}:`, await res.text());
          continue;
        }

        const receiptsData = await res.json();
        const receipts = receiptsData.results || [];
        let ordersProcessed = 0;
        let inventoryDeducted = 0;

        for (const receipt of receipts) {
          const receiptId = String(receipt.receipt_id);
          
          // Check if order already recorded in local orders table
          const { data: existingOrder } = await adminClient
            .from("orders")
            .select("id")
            .eq("order_number", `ETSY-${receiptId}`)
            .maybeSingle();

          if (existingOrder) {
            continue; // Already processed
          }

          // Fetch or Create Customer for this order
          const customerName = receipt.name || "Etsy Customer";
          const customerEmail = receipt.buyer_email || "";
          let customerId = null;

          if (customerEmail) {
            const { data: cust } = await adminClient
              .from("customers")
              .select("id")
              .eq("email", customerEmail)
              .maybeSingle();

            if (cust) {
              customerId = cust.id;
            }
          }

          if (!customerId) {
            const nameParts = customerName.split(" ");
            const firstName = nameParts[0] || "Etsy";
            const lastName = nameParts.slice(1).join(" ") || "Buyer";

            const { data: newCust, error: custErr } = await adminClient
              .from("customers")
              .insert({
                organization_id: integration.organization_id,
                first_name: firstName,
                last_name: lastName,
                email: customerEmail || null,
                shipping_address: `${receipt.first_line || ""}, ${receipt.city || ""}, ${receipt.state || ""} ${receipt.zip || ""}`.trim(),
                notes: `Imported from Etsy Order #${receiptId}`
              })
              .select()
              .single();

            if (newCust && !custErr) {
              customerId = newCust.id;
            }
          }

          const grandTotal = (receipt.grandtotal?.amount || 0) / (receipt.grandtotal?.divisor || 100);

          // Insert order
          const { data: insertedOrder, error: orderErr } = await adminClient
            .from("orders")
            .insert({
              organization_id: integration.organization_id,
              customer_id: customerId,
              order_number: `ETSY-${receiptId}`,
              status: receipt.is_shipped ? "Fulfilled" : "Pending",
              total_amount: grandTotal,
              payment_method: "Etsy Payments",
              notes: `Etsy Receipt ID: ${receiptId}`,
              created_at: new Date((receipt.created_timestamp || Date.now() / 1000) * 1000).toISOString()
            })
            .select()
            .single();

          if (orderErr) {
            console.error("Failed to insert Etsy order:", orderErr);
            continue;
          }

          ordersProcessed++;

          // Process transaction items and deduct local inventory
          const transactions = receipt.transactions || [];
          for (const tx of transactions) {
            const listingId = String(tx.listing_id);
            const sku = tx.sku || null;
            const quantitySold = Number(tx.quantity || 1);

            // Find matching internal inventory mapping
            let query = adminClient
              .from("sku_mappings")
              .select("*")
              .eq("user_id", integration.user_id)
              .eq("listing_id", listingId);

            if (sku) {
              query = query.eq("sku", sku);
            }

            const { data: mappings } = await query;
            const mapping = mappings?.[0];

            if (mapping && mapping.inventory_id && mapping.sync_inventory) {
              // Deduct from fresh_produce_inventory or regular items
              const { data: produceItem } = await adminClient
                .from("fresh_produce_inventory")
                .select("id, weight_available")
                .eq("id", mapping.inventory_id)
                .maybeSingle();

              if (produceItem) {
                const newQty = Math.max(0, Number(produceItem.weight_available) - quantitySold);
                await adminClient
                  .from("fresh_produce_inventory")
                  .update({ weight_available: newQty, updated_at: new Date().toISOString() })
                  .eq("id", produceItem.id);
                inventoryDeducted++;
              }
            }
          }

          // Pause briefly between receipts
          await sleep(200);
        }

        syncSummary.push({
          shop_id: shopId,
          orders_processed: ordersProcessed,
          inventory_deducted: inventoryDeducted
        });

      } catch (shopErr: any) {
        console.error(`Error processing shop ${integration.etsy_shop_id}:`, shopErr);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      summary: syncSummary
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("etsy-poll-orders exception:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});