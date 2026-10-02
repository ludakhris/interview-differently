import * as Sentry from '@sentry/nestjs'

/**
 * Error monitoring — a no-op unless SENTRY_DSN is set. Must be imported
 * before anything else in main.ts so instrumentation can hook the framework.
 *
 * Privacy: PII sending stays off (default); request bodies carry candidate answers and headers carry bearer
 * tokens, so both are stripped before an event leaves the process.
 */
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.05),
    beforeSend(event) {
      if (event.request) {
        delete event.request.data
        delete event.request.cookies
        delete event.request.headers
      }
      return event
    },
  })
}
