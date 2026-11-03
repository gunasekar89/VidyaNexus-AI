import { all, db } from './db.js'
import * as m001 from './migrations/001-baseline.js'
import * as m002 from './migrations/002-identity-tenancy.js'
import * as m003 from './migrations/003-operations.js'

// Ordered list of schema migrations. Never edit one that has shipped; add a new one.
export const migrations = [m001, m002, m003]

// Applies pending migrations, each in its own transaction. Foreign keys are
// switched off while a migration rebuilds tables (SQLite's documented
// procedure) and checked before the transaction commits.
export function migrate({ log = console.log } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`)
  const done = new Set(all('SELECT id FROM schema_migrations').map((r) => r.id))
  const applied = []
  for (const m of migrations) {
    if (done.has(m.id)) continue
    db.exec('PRAGMA foreign_keys = OFF')
    db.exec('BEGIN')
    try {
      db.exec(m.sql)
      const broken = all('PRAGMA foreign_key_check')
      if (broken.length) throw new Error(`Migration ${m.id} left broken references: ${JSON.stringify(broken.slice(0, 5))}`)
      db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(m.id)
      db.exec('COMMIT')
      applied.push(m.id)
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    } finally {
      db.exec('PRAGMA foreign_keys = ON')
    }
  }
  if (applied.length) log(`Database migrations applied: ${applied.join(', ')}`)
  return applied
}
