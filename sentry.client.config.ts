// Client-side Sentry initialization.
// NOTE: this project runs Next.js 14, where the browser SDK must be initialized
// from `sentry.client.config.ts`. `instrumentation-client.ts` is only picked up
// on Next.js >= 15.3, so it is intentionally not used here.
import * as Sentry from "@sentry/nextjs";

const isProd = process.env.NODE_ENV === "production";

Sentry.init({
  dsn: "https://391f151162a15a7f75c888bdc35f4d93@o4511980435668992.ingest.us.sentry.io/4511980448645120",

  // Only log Sentry internals to the console during local development.
  debug: false,

  integrations: [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })],

  // Sample a small fraction of transactions in production to control quota/cost.
  tracesSampleRate: isProd ? 0.1 : 1,

  replaysSessionSampleRate: isProd ? 0.05 : 0,
  replaysOnErrorSampleRate: 1.0,
});
