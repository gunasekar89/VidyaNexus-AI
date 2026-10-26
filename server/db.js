import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

// One SQLite file holds everything. In Docker it lives on a named volume, so
// data survives container restarts and rebuilds.
const file = process.env.DATABASE_FILE || path.resolve('data/vidyanexus.db')
fs.mkdirSync(path.dirname(file), { recursive: true })

export const db = new DatabaseSync(file)
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'teacher')),
  name TEXT NOT NULL,
  first_name_en TEXT NOT NULL,
  first_name_kn TEXT NOT NULL,
  class_name_en TEXT NOT NULL DEFAULT 'Class 7A',
  class_name_kn TEXT NOT NULL DEFAULT '7ನೇ ತರಗತಿ ಎ',
  school_en TEXT NOT NULL DEFAULT 'Vidya Public School, Bengaluru',
  school_kn TEXT NOT NULL DEFAULT 'ವಿದ್ಯಾ ಪಬ್ಲಿಕ್ ಶಾಲೆ, ಬೆಂಗಳೂರು',
  roll_no TEXT NOT NULL DEFAULT '',
  guardian TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  avatar TEXT,
  lang TEXT NOT NULL DEFAULT 'en',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS homework (
  id INTEGER PRIMARY KEY,
  subject TEXT NOT NULL,
  title_en TEXT NOT NULL, title_kn TEXT NOT NULL,
  detail_en TEXT NOT NULL DEFAULT '', detail_kn TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL,
  project INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS homework_status (
  homework_id INTEGER NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  done_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (homework_id, student_id)
);
CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label_en TEXT NOT NULL, label_kn TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  week_start TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY,
  title_en TEXT NOT NULL, title_kn TEXT NOT NULL,
  body_en TEXT NOT NULL, body_kn TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  important INTEGER NOT NULL DEFAULT 0,
  event_date TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY,
  subject TEXT NOT NULL,
  name_en TEXT NOT NULL, name_kn TEXT NOT NULL,
  exam_date TEXT NOT NULL,
  syllabus_en TEXT NOT NULL DEFAULT '', syllabus_kn TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  name_en TEXT NOT NULL, name_kn TEXT NOT NULL,
  score REAL NOT NULL, max REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS attendance (
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('P', 'A', 'H')),
  PRIMARY KEY (student_id, date)
);
CREATE TABLE IF NOT EXISTS study_log (
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (student_id, date)
);
CREATE TABLE IF NOT EXISTS chapter_progress (
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  chapter_index INTEGER NOT NULL,
  done_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (student_id, subject, chapter_index)
);
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_en TEXT NOT NULL, title_kn TEXT NOT NULL,
  summary_en TEXT NOT NULL, summary_kn TEXT NOT NULL,
  steps TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'starter',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS test_attempts (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  title_en TEXT NOT NULL, title_kn TEXT NOT NULL,
  score INTEGER NOT NULL, total INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS awards (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_en TEXT NOT NULL, title_kn TEXT NOT NULL,
  note_en TEXT NOT NULL DEFAULT '', note_kn TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'academic',
  level TEXT NOT NULL DEFAULT 'school',
  medal TEXT NOT NULL DEFAULT 'special',
  award_date TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notification_reads (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);
`)

export const one = (sql, ...params) => db.prepare(sql).get(...params)
export const all = (sql, ...params) => db.prepare(sql).all(...params)
export const run = (sql, ...params) => db.prepare(sql).run(...params)

export function transaction(fn) {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}
