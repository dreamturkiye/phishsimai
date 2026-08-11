/**
 * Product API routes for Vercel serverless (lazy-loaded from api/handler.ts).
 */
import type { Express } from 'express'
import { createExpressMiddleware } from '@trpc/server/adapters/express'
import { appRouter } from './routers'
import { createContext } from './_core/context'
import { registerOAuthRoutes } from './_core/oauth'
import { registerTrackingRoutes } from './email/tracker'
import { scheduledCampaignHandler } from './scheduledHandlers'
import { miaSpeak, miaFeedbackDigest } from './mia/routes'
import { miaHttpChat, miaHttpActivation, miaHttpFeedback } from './mia/http'
import { initSentry } from './os/sentryServer'
import { sentryErrorMiddleware } from './os/sentryExpress'

// PS-SENTRY-01 (2026-07-22): this is the path that actually runs in production (Vercel
// serverless via api/handler.ts), and it never initialised Sentry — initSentry() had no
// production caller anywhere, so every captureServerError() in the codebase was a no-op and
// Sentry had never transmitted a single event. Init at module load, once per cold start.
const sentryOn = initSentry()
console.log(`[sentry] server capture ${sentryOn ? 'ENABLED' : 'disabled (SENTRY_DSN unset)'}`)

export function mountProductApi(app: Express): void {
  registerTrackingRoutes(app)
  registerOAuthRoutes(app)

  app.post('/api/scheduled/campaign', scheduledCampaignHandler)
  app.post('/api/mia/speak', miaSpeak)
  app.post('/api/mia/chat', miaHttpChat)
  app.get('/api/mia/activation', miaHttpActivation)
  app.post('/api/mia/feedback', miaHttpFeedback)
  app.get('/api/scheduled/mia-feedback-digest', miaFeedbackDigest)

  app.use(
    '/api/trpc',
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  )

  // Must be registered AFTER every route — Express only routes errors to a 4-arg handler
  // that comes after the handlers which threw.
  app.use(sentryErrorMiddleware)
}
