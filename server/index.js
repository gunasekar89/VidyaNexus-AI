import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { MODEL, aiEnabled } from './ai.js'
import { loadUser } from './auth.js'
import { run } from './db.js'
import { api } from './routes.js'
import { demoAccounts, seedIfEmpty } from './seed.js'

const PORT = Number(process.env.PORT || 3000)
const dist = path.resolve('dist')

if (seedIfEmpty()) {
  console.log('Created the demo school:')
  console.log(`  student  ${demoAccounts.student.email} / ${demoAccounts.student.password}`)
  console.log(`  teacher  ${demoAccounts.teacher.email} / ${demoAccounts.teacher.password}`)
}
run('DELETE FROM sessions WHERE expires_at < ?', new Date().toISOString())

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'same-origin')
  next()
})
app.use(loadUser)
app.use('/api', api)

// In production the same server hosts the built React app.
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }))
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

app.listen(PORT, () => {
  console.log(`VidyaNexus is running on http://localhost:${PORT}`)
  console.log(aiEnabled() ? `AI Tutor: on (${MODEL})` : 'AI Tutor: offline replies (set ANTHROPIC_API_KEY to turn on Claude)')
})
