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
}
