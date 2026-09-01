// Supabase Edge Function: square-create-payment
// Creates a payment / charge using connected merchant's credentials and attaches the 1% platform revenue split.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAuthorizedOrg, isOrgAuthError } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const squareEnvironment = Deno.env.get("SQUARE_ENVIRONMENT") || "production";

    const squareApiHost = squareEnvironment === "sandbox"
      ? "https://connect.squareupsandbox.com"
      : "https://connect.squareup.com";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const {
      organization_id,
      source_id,
      amount_money,
      order_id,
      customer_id,
      note,
      idempotency_key
    } = body;

    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!amount_money || typeof amount_money.amount !== "number") {
      return new Response(JSON.stringify({ error: "Valid amount_money object required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Amount is in the currency's smallest unit (cents). Reject non-positive,
    // non-integer, or implausibly large values before hitting Square.
    const MAX_AMOUNT_CENTS = 5_000_000; // $50,000
    if (
      !Number.isInteger(amount_money.amount) ||
      amount_money.amount <= 0 ||
      amount_money.amount > MAX_AMOUNT_CENTS
    ) {
      return new Response(JSON.stringify({ error: "amount_money.amount must be a positive integer number of cents within allowed limits" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Bind organization_id to the authenticated caller's verified membership
    // rather than trusting the client-supplied value directly.
    const authResult = await resolveAuthorizedOrg(req, supabaseUrl, supabaseServiceKey, organization_id);
    if (isOrgAuthError(authResult)) {
      return new Response(JSON.stringify({ error: authResult.error }), {
        status: authResult.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const verifiedOrgId = authResult.organizationId;

    // Retrieve organization's Square access token and merchant ID
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("square_access_token, square_merchant_id, currency")
      .eq("id", verifiedOrgId)
      .single();

    if (orgError || !org || !org.square_access_token) {
      return new Response(JSON.stringify({ error: "Organization is not connected to Square" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const orderTotalCents = amount_money.amount;
    const currency = amount_money.currency || org.currency || "USD";
    
    // Calculate 1% platform revenue fee split
    const appFeeCents = Math.round(orderTotalCents * 0.01);

    // Prefer a deterministic idempotency key tied to the order + amount so a
    // client retry after a dropped response never creates a second charge.
    const resolvedIdempotencyKey =
      idempotency_key ||
      (order_id ? `order-${order_id}-${orderTotalCents}` : crypto.randomUUID());

    const paymentPayload: any = {
      idempotency_key: resolvedIdempotencyKey,
      source_id: source_id || "EXTERNAL",
      amount_money: {
        amount: orderTotalCents,
        currency: currency
      },
      app_fee_money: {
        amount: appFeeCents,
        currency: currency
      },
      note: note || `Order payment via Sierra Myco Lab`
    };

    if (customer_id) {
      paymentPayload.customer_id = customer_id;
    }

    // Dispatch payment request directly to Square API with merchant's OAuth Bearer token
    const paymentResp = await fetch(`${squareApiHost}/v2/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${org.square_access_token}`,
        "Square-Version": "2024-01-18"
      },
      body: JSON.stringify(paymentPayload)
    });

    const paymentData = await paymentResp.json();

    if (!paymentResp.ok || paymentData.errors) {
      console.error("Square Payment Error:", paymentData);
      return new Response(JSON.stringify({
        error: paymentData.errors?.[0]?.detail || "Square payment creation failed",
        errors: paymentData.errors
      }), {
        status: paymentResp.status || 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // If order_id provided, update order payment status in database
    // (scoped to the verified org so a caller can't touch another org's order).
    // Append to any existing notes rather than clobbering them.
    if (order_id) {
      const { data: existingOrder } = await supabase
        .from("orders")
        .select("notes")
        .eq("id", order_id)
        .eq("organization_id", verifiedOrgId)
        .single();

      const paymentNote = `Square Payment ID: ${paymentData.payment?.id || "Processed"}`;
      const nextNotes = [existingOrder?.notes, note, paymentNote]
        .filter((part) => part && String(part).trim())
        .join(" | ");

      await supabase
        .from("orders")
        .update({
          payment_status: "paid",
          payment_method: "Square",
          notes: nextNotes
        })
        .eq("id", order_id)
        .eq("organization_id", verifiedOrgId);
    }

    return new Response(JSON.stringify({
      success: true,
      payment: paymentData.payment,
      app_fee_money: paymentPayload.app_fee_money
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("Square Payment Function Exception:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});