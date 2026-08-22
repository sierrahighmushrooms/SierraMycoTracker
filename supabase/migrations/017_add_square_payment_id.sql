-- Migration: 017_add_square_payment_id.sql
-- Description: Add square_payment_id column to orders and sales_orders tables, and notify schema cache reload.

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'orders') THEN
    ALTER TABLE public.orders 
    ADD COLUMN IF NOT EXISTS square_payment_id text;
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sales_orders') THEN
    ALTER TABLE public.sales_orders 
    ADD COLUMN IF NOT EXISTS square_payment_id text;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';