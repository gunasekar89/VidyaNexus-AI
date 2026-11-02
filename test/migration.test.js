// Upgrading a database made by the previous release (no tenancy) keeps every
// record and attaches it to the demo school, so existing logins keep working.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { startApp } from './helpers.js'

let app
const counts = {}
const TABLES = ['users', 'homework', 'announcements', 'exams', 'results', 'attendance', 'awards', 'goals', 'chapter_progress']

before(async () => {
  app = await startApp({
    async prepare() {
      // Build the old schema and old demo data exactly as v0.2 did.
      const { db, one } = await import('../server/db.js')
      const m001 = await import('../server/migrations/001-baseline.js')
      db.exec(m001.sql)
      db.exec("CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now'))); INSERT INTO schema_migrations (id) VALUES ('001-baseline')")
      const { seedIfEmpty } = await import('../server/seed.js')
      assert.equal(seedIfEmpty(), true)
      for (const t of TABLES) counts[t] = one(`SELECT COUNT(*) AS n FROM ${t}`).n
    },
  })
})
after(() => app.close())

test('no legacy record is lost and every one belongs to a school', () => {
  const { one } = app.db
  // seedDemoIdentities adds new people and a second school; compare legacy rows only.
  const legacy = one("SELECT COUNT(*) AS n FROM users WHERE email IN (SELECT email FROM users WHERE role IN ('student', 'teacher') AND email LIKE '%@vidyanexus.school')").n
  assert.equal(legacy, counts.users)
  for (const t of ['results', 'attendance', 'awards', 'goals', 'chapter_progress']) {
    assert.equal(one(`SELECT COUNT(*) AS n FROM ${t}`).n, counts[t], t)
  }
  for (const t of ['homework', 'announcements', 'exams', 'results', 'attendance', 'awards']) {
    assert.equal(one(`SELECT COUNT(*) AS n FROM ${t} WHERE school_id IS NULL`).n, 0, t)
  }
  // The 4 legacy students, plus Nikhil at the second demo school.
  assert.equal(one('SELECT COUNT(*) AS n FROM enrollments').n, 5)
  assert.deepEqual(app.db.all('PRAGMA foreign_key_check'), [])
})

test('existing student and teacher logins keep working with their old data', async () => {
  const jason = app.client()
  const s = await jason.login('jason@vidyanexus.school', 'jason123')
  assert.equal(s.active.role, 'student')
  const o = (await jason.get('/student/overview')).data
  assert.equal(o.homework.length, 6)
  assert.equal(o.awards.length, 5)

  const dola = app.client()
  const t = await dola.login('dola.ramesh@vidyanexus.school', 'teacher123')
  assert.equal(t.active.role, 'teacher')
  assert.equal((await dola.get('/teacher/overview')).data.students.length, 4)
})
