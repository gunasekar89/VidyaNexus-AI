import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Starts the app on a fresh temporary database with the demo data, and returns
// a tiny HTTP client that keeps one cookie per "browser".
export async function startApp({ prepare } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vn-test-'))
  process.env.DATABASE_FILE = path.join(dir, 'test.db')
  process.env.SHOW_DEMO_LOGINS = 'true'
  process.env.LOGIN_RATE_LIMIT = '1000'
  for (const k of ['ANTHROPIC_API_KEY', 'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY']) delete process.env[k]
  if (prepare) await prepare()
  const { migrate } = await import('../server/migrate.js')
  const { seedIfEmpty } = await import('../server/seed.js')
  const { backfillLegacy, seedDemoIdentities } = await import('../server/tenancy.js')
  const { seedOperations } = await import('../server/ops/seed.js')
  const { createApp } = await import('../server/app.js')
  migrate({ log: () => {} })
  seedIfEmpty()
  backfillLegacy()
  seedDemoIdentities()
  seedOperations()
  const server = createApp().listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}/api`
  const db = await import('../server/db.js')
  return { base, db, close: () => server.close(), client: () => client(base) }
}

export function client(base) {
  let cookie = ''
  const call = async (method, p, body) => {
    const res = await fetch(base + p, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    const data = await res.json().catch(() => ({}))
    return { status: res.status, data }
  }
  return {
    get: (p) => call('GET', p),
    post: (p, b = {}) => call('POST', p, b),
    put: (p, b = {}) => call('PUT', p, b),
    patch: (p, b = {}) => call('PATCH', p, b),
    del: (p) => call('DELETE', p),
    async login(identifier, password, extra = {}) {
      const r = await call('POST', '/auth/login', { identifier, password, ...extra })
      if (r.status !== 200) throw new Error(`login failed for ${identifier}: ${r.status} ${JSON.stringify(r.data)}`)
      return r.data
    },
  }
}
