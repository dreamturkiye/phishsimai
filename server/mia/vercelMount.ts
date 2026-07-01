/** Lightweight Mia routes for Vercel handler (no full tRPC bundle). */
import type { Express } from 'express'
import { miaSpeak, miaFeedbackDigest } from './routes'
import { miaHttpChat, miaHttpActivation, miaHttpFeedback } from './http'

export function mountMiaApi(app: Express): void {
  app.post('/api/mia/speak', miaSpeak)
  app.post('/api/mia/chat', miaHttpChat)
  app.get('/api/mia/activation', miaHttpActivation)
  app.post('/api/mia/feedback', miaHttpFeedback)
  app.get('/api/scheduled/mia-feedback-digest', miaFeedbackDigest)
}
