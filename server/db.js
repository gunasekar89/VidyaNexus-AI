import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

// One SQLite file holds everything. In Docker it lives on a named volume, so
// data survives container restarts and rebuilds.
const file = process.env.DATABASE_FILE || path.resolve('data/vidyanexus.db')
fs.mkdirSync(path.dirname(file), { recursive: true })

export const db = new DatabaseSync(file)
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')

// Tables are created and changed by migrations (server/migrate.js).

export const one = (sql, ...params) => db.prepare(sql).get(...params)
export const all = (sql, ...params) => db.prepare(sql).all(...params)
export const run = (sql, ...params) => db.prepare(sql).run(...params)

// Runs fn inside one database transaction (nested calls join the outer one).
let depth = 0
export function transaction(fn) {
  if (depth > 0) return fn()
  db.exec('BEGIN')
  depth++
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  } finally {
    depth--
  }
}
