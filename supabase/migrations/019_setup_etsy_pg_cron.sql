-- Migration: 019_setup_etsy_pg_cron.sql
-- Description: Sets up pg_cron and pg_net extensions to trigger the etsy-poll-orders Edge Function every 15 minutes.

-- 1. Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Schedule cron job to invoke etsy-poll-orders every 15 minutes
-- Replace YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY if executing directly in SQL editor
SELECT cron.unschedule('etsy-poll-orders-every-15min')
WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'etsy-poll-orders-every-15min'
);

SELECT cron.schedule(
    'etsy-poll-orders-every-15min',
    '*/15 * * * *', -- Every 15 minutes
    $$
    SELECT
      net.http_post(
          url := current_setting('app.settings.supabase_url', true) || '/functions/v1/etsy-poll-orders',
          headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
          ),
          body := '{}'::jsonb
      ) as request_id;
    $$
);