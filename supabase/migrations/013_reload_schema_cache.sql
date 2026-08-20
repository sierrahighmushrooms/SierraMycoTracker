-- Reload PostgREST schema cache to fix PGRST204 errors
NOTIFY pgrst, reload_schema;