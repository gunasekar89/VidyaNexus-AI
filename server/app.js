import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { loadContext, requestId } from './access.js'
import { loadUser } from './auth.js'
import { identity } from './identity.js'
import { api, errorHandler } from './routes.js'

// The Express app: security headers, session + workspace context, the API, and
// (in production) the built React app.
export function createApp() {
  const dist = path.resolve('dist')
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'same-origin')
    res.setHeader('X-Frame-Options', 'DENY')
    next()
  })
  app.use(requestId)
  app.use(loadUser)
  app.use(loadContext)
  app.use('/api', identity)
  app.use('/api', api)
  app.use('/api', errorHandler)

  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }))
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
  }
  return app
}
