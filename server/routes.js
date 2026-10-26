import express from 'express'
import { awardCategories, awardLevels, awardMedals, mockTest, subjectById } from '../shared/catalog.js'
import { MODEL, PROVIDER, aiEnabled, aiErrorCode, generateJSON, isAIError, streamChat, translate } from './ai.js'
import {
  clearSessionCookie,
  createSession,
  destroySession,
  hashPassword,
  publicUser,
  rateLimit,
  requireRole,
  requireUser,
  setSessionCookie,
  verifyPassword,
} from './auth.js'
import { all, one, run, transaction } from './db.js'
import { isDate, isoDate, weekStart } from './dates.js'
import { offlineReply } from './offline.js'
import { addStudent, demoAccounts } from './seed.js'
import {
  ANNOUNCEMENT_CATEGORIES,
  latestPlan,
  studentContext,
  studentOverview,
  toAnnouncement,
  toAward,
  toExam,
  toHomework,
  toResult,
} from './student.js'

export const api = express.Router()
api.use(express.json({ limit: '100kb' }))

// Express 4 does not catch rejected promises, so wrap async handlers.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

class HttpError extends Error {
  constructor(status, code) {
    super(code)
    this.status = status
  }
}
const bad = (code = 'invalid') => new HttpError(400, code)

const text = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
function required(v, max) {
  const s = text(v, max)
  if (!s) throw bad('missing.field')
  return s
}
const id = (v) => {
  const n = Number(v)
  if (!Number.isInteger(n) || n <= 0) throw bad()
  return n
}
const lang = (v) => (v === 'kn' ? 'kn' : 'en')

// Fills in whichever language is missing, using AI translation when available.
async function bilingual(fields) {
  const missing = { kn: [], en: [] }
  for (const [key, f] of Object.entries(fields)) {
    if (f.en && !f.kn) missing.kn.push(key)
    else if (f.kn && !f.en) missing.en.push(key)
  }
  for (const target of ['kn', 'en']) {
    const keys = missing[target]
    if (!keys.length) continue
    const source = target === 'kn' ? 'en' : 'kn'
    const out = await translate(keys.map((k) => fields[k][source]), target)
    keys.forEach((k, i) => (fields[k][target] = out?.[i] || fields[k][source]))
  }
  return fields
}

// ---------- Auth ----------

const loginLimit = rateLimit({ windowMs: 15 * 60e3, max: 20 })

api.post(
  '/auth/login',
  loginLimit,
  wrap(async (req, res) => {
    const email = text(req.body.email, 200).toLowerCase()
    const user = one('SELECT * FROM users WHERE email = ?', email)
    if (!user || !verifyPassword(String(req.body.password ?? ''), user.password_hash)) {
      return res.status(401).json({ error: 'auth.invalid' })
    }
    setSessionCookie(res, createSession(user.id))
    res.json({ user: publicUser(user), aiEnabled: aiEnabled() })
  }),
)

// Lists the seeded demo accounts for the login screen, but only while they still
// have their default passwords (and SHOW_DEMO_LOGINS isn't 'false').
api.get('/auth/demo', (_req, res) => {
  if (process.env.SHOW_DEMO_LOGINS === 'false') return res.json({ accounts: [] })
  const accounts = Object.entries(demoAccounts)
    .filter(([, a]) => {
      const u = one('SELECT password_hash FROM users WHERE email = ?', a.email)
      return u && verifyPassword(a.password, u.password_hash)
    })
    .map(([role, a]) => ({ role, ...a }))
  res.json({ accounts })
})

api.post('/auth/logout', (req, res) => {
  if (req.user) destroySession(req.user.token)
  clearSessionCookie(res)
  res.json({ ok: true })
})

api.get('/me', requireUser, (req, res) => res.json({ user: publicUser(req.user), aiEnabled: aiEnabled() }))

api.patch('/me', requireUser, (req, res) => {
  const u = req.user
  run(
    'UPDATE users SET lang = ?, phone = ?, guardian = ? WHERE id = ?',
    req.body.lang ? lang(req.body.lang) : u.lang,
    req.body.phone !== undefined ? text(req.body.phone, 40) : u.phone,
    req.body.guardian !== undefined ? text(req.body.guardian, 80) : u.guardian,
    u.id,
  )
  res.json({ user: publicUser(one('SELECT * FROM users WHERE id = ?', u.id)) })
})

api.post('/me/password', requireUser, (req, res) => {
  const next = String(req.body.next ?? '')
  if (!verifyPassword(String(req.body.current ?? ''), req.user.password_hash)) return res.status(400).json({ error: 'auth.wrongPassword' })
  if (next.length < 8) return res.status(400).json({ error: 'auth.shortPassword' })
  run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(next), req.user.id)
  // Sign out other devices.
  run('DELETE FROM sessions WHERE user_id = ? AND token != ?', req.user.id, req.user.token)
  res.json({ ok: true })
})

// ---------- Student ----------

const student = requireRole('student')

api.get('/student/overview', student, (req, res) => res.json(studentOverview(req.user)))

api.post('/homework/:id/toggle', student, (req, res) => {
  const hw = one('SELECT id FROM homework WHERE id = ?', id(req.params.id))
  if (!hw) throw new HttpError(404, 'not.found')
  const existing = one('SELECT 1 FROM homework_status WHERE homework_id = ? AND student_id = ?', hw.id, req.user.id)
  if (existing) run('DELETE FROM homework_status WHERE homework_id = ? AND student_id = ?', hw.id, req.user.id)
  else run('INSERT INTO homework_status (homework_id, student_id) VALUES (?, ?)', hw.id, req.user.id)
  res.json({ done: !existing })
})

api.post(
  '/goals',
  student,
  wrap(async (req, res) => {
    const label = required(req.body.label, 140)
    // Store what the student typed in their language and translate the other side.
    const from = lang(req.body.lang)
    const fields = await bilingual({ label: { en: from === 'en' ? label : '', kn: from === 'kn' ? label : '' } })
    run('INSERT INTO goals (student_id, label_en, label_kn, week_start) VALUES (?, ?, ?, ?)', req.user.id, fields.label.en, fields.label.kn, weekStart())
    res.json({ ok: true })
  }),
)

api.patch('/goals/:id', student, (req, res) => {
  run('UPDATE goals SET done = ? WHERE id = ? AND student_id = ?', req.body.done ? 1 : 0, id(req.params.id), req.user.id)
  res.json({ ok: true })
})

api.delete('/goals/:id', student, (req, res) => {
  run('DELETE FROM goals WHERE id = ? AND student_id = ?', id(req.params.id), req.user.id)
  res.json({ ok: true })
})

function checkChapter(req) {
  const subject = subjectById[req.params.subject]
  const index = Number(req.params.index)
  if (!subject || !Number.isInteger(index) || index < 0 || index >= subject.chapters.length) throw bad()
  return [subject.id, index]
}

api.post('/chapters/:subject/:index', student, (req, res) => {
  const [subject, index] = checkChapter(req)
  run('INSERT OR IGNORE INTO chapter_progress (student_id, subject, chapter_index) VALUES (?, ?, ?)', req.user.id, subject, index)
  res.json({ ok: true })
})

api.delete('/chapters/:subject/:index', student, (req, res) => {
  const [subject, index] = checkChapter(req)
  run('DELETE FROM chapter_progress WHERE student_id = ? AND subject = ? AND chapter_index = ?', req.user.id, subject, index)
  res.json({ ok: true })
})

// The app pings once a minute while a student has it open; that's their study time.
api.post('/study/ping', student, rateLimit({ windowMs: 50e3, max: 1, key: (req) => req.user.id }), (req, res) => {
  run(
    `INSERT INTO study_log (student_id, date, minutes) VALUES (?, ?, 1)
     ON CONFLICT (student_id, date) DO UPDATE SET minutes = minutes + 1`,
    req.user.id,
    isoDate(),
  )
  res.json({ ok: true })
})

api.post('/notifications/read', requireUser, (req, res) => {
  const keys = Array.isArray(req.body.keys) ? req.body.keys.slice(0, 50) : []
  for (const key of keys) run('INSERT OR IGNORE INTO notification_reads (user_id, key) VALUES (?, ?)', req.user.id, text(key, 40))
  res.json({ ok: true })
})

// "Start plan" turns each plan step into a weekly goal.
api.post('/plan/start', student, (req, res) => {
  const plan = latestPlan(req.user.id)
  if (!plan) throw new HttpError(404, 'not.found')
  transaction(() => {
    for (const step of plan.steps) {
      run(
        'INSERT INTO goals (student_id, label_en, label_kn, week_start) VALUES (?, ?, ?, ?)',
        req.user.id,
        `${step.day.en}: ${step.task.en}`,
        `${step.day.kn}: ${step.task.kn}`,
        weekStart(),
      )
    }
  })
  res.json({ ok: true })
})

api.post('/tests/attempts', student, (req, res) => {
  const score = Number(req.body.score)
  const total = Number(req.body.total)
  if (!Number.isInteger(score) || !Number.isInteger(total) || total <= 0 || total > 50 || score < 0 || score > total) throw bad()
  const subject = subjectById[req.body.subject] ? req.body.subject : 'mathematics'
  run(
    'INSERT INTO test_attempts (student_id, subject, title_en, title_kn, score, total) VALUES (?, ?, ?, ?, ?, ?)',
    req.user.id,
    subject,
    text(req.body.title?.en, 120) || 'Mock test',
    text(req.body.title?.kn, 120) || 'ಅಣಕು ಪರೀಕ್ಷೆ',
    score,
    total,
  )
  res.json({ ok: true })
})

// ---------- AI ----------

const aiLimit = rateLimit({ windowMs: 10 * 60e3, max: Number(process.env.AI_REQUESTS_PER_10_MIN || 40), key: (req) => req.user.id })

const TUTOR_PROMPT = `You are VidyaNexus AI Tutor, a warm and patient study buddy for a Class 7 student at a school in Bengaluru, Karnataka (state board / NCERT-style syllabus).

How to help:
- Explain ideas simply, step by step, with everyday Indian examples (cricket, markets, festivals, buses, cooking).
- When the student asks for practice questions, give them and offer to check answers. When they give an answer, check it kindly and show the working.
- For homework, guide with hints and worked examples of similar problems instead of handing over the final answer to the exact question.
- Use the student context below to personalise advice (current chapters, upcoming exams, pending homework).
- Keep answers short enough to read on a phone: a few short paragraphs or bullet points. Use **bold** for key words and "•" or numbered lines for lists. Do not use tables, headings or code blocks.
- Stay on schoolwork, study habits and general knowledge suitable for a 12-year-old. Gently steer away from anything unsafe or unrelated, and suggest talking to a teacher or parent about personal worries.`

const languageNote = (l) =>
  l === 'kn'
    ? 'The app is set to Kannada. Reply in simple Kannada (ಕನ್ನಡ script); keep English for maths symbols, formulas and technical words where that is clearer.'
    : 'The app is set to English. Reply in simple English unless the student writes in Kannada, then reply in Kannada.'

api.get('/ai/chat', student, (req, res) => {
  res.json({
    messages: all('SELECT id, role, content, created_at FROM (SELECT * FROM chat_messages WHERE student_id = ? ORDER BY id DESC LIMIT 60) ORDER BY id', req.user.id),
    aiEnabled: aiEnabled(),
  })
})

api.delete('/ai/chat', student, (req, res) => {
  run('DELETE FROM chat_messages WHERE student_id = ?', req.user.id)
  res.json({ ok: true })
})

// Streams the tutor's reply as server-sent events: {t: text} chunks, then {done: true}.
api.post(
  '/ai/chat',
  student,
  aiLimit,
  wrap(async (req, res) => {
    const message = required(req.body.message, 2000)
    const l = lang(req.body.lang)
    run("INSERT INTO chat_messages (student_id, role, content) VALUES (?, 'user', ?)", req.user.id, message)

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)

    let reply = ''
    if (!aiEnabled()) {
      reply = offlineReply(message, l)
      send({ t: reply, offline: true })
    } else {
      const history = all(
        'SELECT role, content FROM (SELECT * FROM chat_messages WHERE student_id = ? ORDER BY id DESC LIMIT 20) ORDER BY id',
        req.user.id,
      )
      // The API needs the conversation to start with a user turn.
      while (history.length && history[0].role !== 'user') history.shift()
      const controller = new AbortController()
      res.on('close', () => !res.writableFinished && controller.abort())
      try {
        const out = await streamChat({
          system: [
            { type: 'text', text: TUTOR_PROMPT, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: `Student context:\n${studentContext(req.user)}\n\n${languageNote(l)}` },
          ],
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          onText: (t) => {
            reply += t
            send({ t })
          },
          signal: controller.signal,
        })
        if (out.stopReason === 'refusal' && !out.text) {
          reply = l === 'kn' ? 'ಕ್ಷಮಿಸಿ, ಅದಕ್ಕೆ ನಾನು ಸಹಾಯ ಮಾಡಲಾರೆ. ನಿಮ್ಮ ಪಾಠಗಳ ಬಗ್ಗೆ ಬೇರೆ ಏನಾದರೂ ಕೇಳಿ!' : "Sorry, I can't help with that one. Ask me something else about your lessons!"
          send({ t: reply })
        }
      } catch (err) {
        if (controller.signal.aborted) return
        console.error('AI tutor error:', err.status ?? '', err.message)
        send({ error: aiErrorCode(err) })
      }
    }
    if (reply) run("INSERT INTO chat_messages (student_id, role, content) VALUES (?, 'assistant', ?)", req.user.id, reply)
    send({ done: true })
    res.end()
  }),
)

const biSchema = {
  type: 'object',
  properties: { en: { type: 'string' }, kn: { type: 'string', description: 'Kannada translation in Kannada script' } },
  required: ['en', 'kn'],
  additionalProperties: false,
}

const planSchema = {
  type: 'object',
  properties: {
    title: biSchema,
    summary: biSchema,
    steps: {
      type: 'array',
      description: 'Exactly 5 daily steps',
      items: {
        type: 'object',
        properties: { day: biSchema, task: biSchema },
        required: ['day', 'task'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'summary', 'steps'],
  additionalProperties: false,
}

function requireAI() {
  if (!aiEnabled()) throw new HttpError(503, 'ai.disabled')
}

api.post(
  '/ai/plan',
  student,
  aiLimit,
  wrap(async (req, res) => {
    requireAI()
    const plan = await generateJSON({
      system:
        'You are the AI study coach in VidyaNexus, a school app for Class 7 students in Bengaluru. You write short, realistic revision plans a 12-year-old can follow, with every text in both English and Kannada.',
      prompt:
        `Make a 5-day revision plan for this student, focused on their nearest exam and weakest areas. ` +
        `Each task is one line with a time in minutes, like "Revise Ch 4 – Simple Equations (20 min)". ` +
        `Title: like "Math Revision Plan" for the subject in focus. Summary: one sentence.\n\n${studentContext(req.user)}`,
      schema: planSchema,
    })
    const steps = plan.steps.slice(0, 7)
    if (!steps.length) throw new HttpError(502, 'ai.failed')
    run(
      `INSERT INTO plans (student_id, title_en, title_kn, summary_en, summary_kn, steps, source) VALUES (?, ?, ?, ?, ?, ?, 'ai')`,
      req.user.id,
      plan.title.en,
      plan.title.kn,
      plan.summary.en,
      plan.summary.kn,
      JSON.stringify(steps),
    )
    res.json({ plan: latestPlan(req.user.id) })
  }),
)

const testSchema = {
  type: 'object',
  properties: {
    title: biSchema,
    questions: {
      type: 'array',
      description: 'Exactly 5 multiple-choice questions',
      items: {
        type: 'object',
        properties: {
          q: biSchema,
          options: { type: 'array', items: { type: 'string' }, description: '4 short options; numbers or symbols work in both languages' },
          answer: { type: 'integer', description: 'Index (0-3) of the correct option' },
        },
        required: ['q', 'options', 'answer'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'questions'],
  additionalProperties: false,
}

// A fresh 5-question practice test on the student's current chapter of a subject.
api.post(
  '/ai/practice-test',
  student,
  aiLimit,
  wrap(async (req, res) => {
    const subject = subjectById[req.body.subject]
    if (!subject) throw bad()
    if (!aiEnabled()) return res.json({ title: { en: 'Algebra Mock Test', kn: 'ಬೀಜಗಣಿತ ಅಣಕು ಪರೀಕ್ಷೆ' }, questions: mockTest, subject: 'mathematics', offline: true })
    const done = new Set(all('SELECT chapter_index FROM chapter_progress WHERE student_id = ? AND subject = ?', req.user.id, subject.id).map((r) => r.chapter_index))
    const current = subject.chapters.find((_, i) => !done.has(i)) ?? subject.chapters.at(-1)
    const recent = subject.chapters.filter((_, i) => done.has(i)).slice(-2)
    const test = await generateJSON({
      system:
        'You write accurate multiple-choice practice questions for Class 7 students in Karnataka (state board / NCERT syllabus). Every question has exactly 4 options and exactly one correct answer. Double-check each answer.',
      prompt:
        `Subject: ${subject.name.en}. Focus chapter: "${current.en}"` +
        (recent.length ? `, plus a little revision of ${recent.map((c) => `"${c.en}"`).join(' and ')}` : '') +
        `. Write 5 questions of mixed difficulty. Title like "${subject.name.en} Practice Test".`,
      schema: testSchema,
    })
    const questions = test.questions
      .filter((q) => Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length)
      .slice(0, 10)
    if (!questions.length) throw new HttpError(502, 'ai.failed')
    res.json({ title: test.title, questions, subject: subject.id })
  }),
)

// ---------- Teacher ----------

const teacher = requireRole('teacher')
const students = () => all("SELECT * FROM users WHERE role = 'student' ORDER BY name")

api.get('/teacher/overview', teacher, (req, res) => {
  const date = isDate(req.query.date) ? req.query.date : isoDate()
  const studentRows = students()
  const marks = Object.fromEntries(all('SELECT student_id, status FROM attendance WHERE date = ?', date).map((r) => [r.student_id, r.status]))
  res.json({
    today: isoDate(),
    students: studentRows.map((s) => ({ ...publicUser(s), attendance: marks[s.id] ?? null })),
    attendanceDate: date,
    homework: all(
      `SELECT h.*, 0 AS done, (SELECT COUNT(*) FROM homework_status s WHERE s.homework_id = h.id) AS done_count
       FROM homework h ORDER BY h.due_date DESC, h.id DESC`,
    ).map(toHomework),
    announcements: all('SELECT * FROM announcements ORDER BY created_at DESC, id DESC').map(toAnnouncement),
    exams: all('SELECT * FROM exams ORDER BY exam_date DESC, id DESC').map(toExam),
    results: all('SELECT * FROM results ORDER BY created_at DESC, id DESC LIMIT 100').map(toResult),
    awards: all('SELECT * FROM awards ORDER BY award_date DESC, id DESC LIMIT 100').map(toAward),
    categories: Object.keys(ANNOUNCEMENT_CATEGORIES),
  })
})

const subjectId = (v) => {
  if (!subjectById[v]) throw bad('invalid.subject')
  return v
}
const date = (v) => {
  if (!isDate(v)) throw bad('invalid.date')
  return v
}
const pair = (body, key, max) => ({ en: text(body[`${key}En`], max), kn: text(body[`${key}Kn`], max) })
function requirePair(p) {
  if (!p.en && !p.kn) throw bad('missing.field')
  return p
}

api.post(
  '/teacher/homework',
  teacher,
  wrap(async (req, res) => {
    const b = req.body
    const subject = subjectId(b.subject)
    const due = date(b.dueDate)
    const f = await bilingual({ title: requirePair(pair(b, 'title', 140)), detail: pair(b, 'detail', 300) })
    run(
      `INSERT INTO homework (subject, title_en, title_kn, detail_en, detail_kn, due_date, project, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      subject, f.title.en, f.title.kn, f.detail.en, f.detail.kn, due, b.project ? 1 : 0, req.user.id,
    )
    res.json({ ok: true })
  }),
)

api.delete('/teacher/homework/:id', teacher, (req, res) => {
  run('DELETE FROM homework WHERE id = ?', id(req.params.id))
  res.json({ ok: true })
})

api.post(
  '/teacher/announcements',
  teacher,
  wrap(async (req, res) => {
    const b = req.body
    const category = ANNOUNCEMENT_CATEGORIES[b.category] ? b.category : 'general'
    const eventDate = b.eventDate ? date(b.eventDate) : null
    const f = await bilingual({ title: requirePair(pair(b, 'title', 140)), body: requirePair(pair(b, 'body', 1000)) })
    run(
      `INSERT INTO announcements (title_en, title_kn, body_en, body_kn, category, important, event_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      f.title.en, f.title.kn, f.body.en, f.body.kn, category, b.important ? 1 : 0, eventDate, req.user.id,
    )
    res.json({ ok: true })
  }),
)

api.delete('/teacher/announcements/:id', teacher, (req, res) => {
  run('DELETE FROM announcements WHERE id = ?', id(req.params.id))
  res.json({ ok: true })
})

api.post(
  '/teacher/exams',
  teacher,
  wrap(async (req, res) => {
    const b = req.body
    const subject = subjectId(b.subject)
    const examDate = date(b.date)
    const f = await bilingual({ name: requirePair(pair(b, 'name', 120)), syllabus: pair(b, 'syllabus', 300) })
    run(
      `INSERT INTO exams (subject, name_en, name_kn, exam_date, syllabus_en, syllabus_kn) VALUES (?, ?, ?, ?, ?, ?)`,
      subject, f.name.en, f.name.kn, examDate, f.syllabus.en, f.syllabus.kn,
    )
    res.json({ ok: true })
  }),
)

api.delete('/teacher/exams/:id', teacher, (req, res) => {
  run('DELETE FROM exams WHERE id = ?', id(req.params.id))
  res.json({ ok: true })
})

// Records one assessment for several students at once: {subject, nameEn, nameKn, max, scores: {studentId: score}}.
api.post(
  '/teacher/results',
  teacher,
  wrap(async (req, res) => {
    const b = req.body
    const subject = subjectId(b.subject)
    const max = Number(b.max)
    if (!(max > 0 && max <= 1000)) throw bad('invalid.max')
    const f = await bilingual({ name: requirePair(pair(b, 'name', 120)) })
    const valid = new Set(students().map((s) => s.id))
    const entries = Object.entries(b.scores ?? {}).filter(([, v]) => v !== '' && v !== null && v !== undefined)
    if (!entries.length) throw bad('missing.field')
    transaction(() => {
      for (const [sid, v] of entries) {
        const score = Number(v)
        if (!valid.has(Number(sid)) || !(score >= 0 && score <= max)) throw bad('invalid.score')
        run('INSERT INTO results (student_id, subject, name_en, name_kn, score, max) VALUES (?, ?, ?, ?, ?, ?)', Number(sid), subject, f.name.en, f.name.kn, score, max)
      }
    })
    res.json({ ok: true })
  }),
)

api.delete('/teacher/results/:id', teacher, (req, res) => {
  run('DELETE FROM results WHERE id = ?', id(req.params.id))
  res.json({ ok: true })
})

const oneOf = (v, options) => {
  if (!Object.hasOwn(options, v)) throw bad()
  return v
}

api.post(
  '/teacher/awards',
  teacher,
  wrap(async (req, res) => {
    const b = req.body
    const student = one("SELECT id FROM users WHERE id = ? AND role = 'student'", id(b.studentId))
    if (!student) throw bad()
    const awardDate = date(b.date)
    const f = await bilingual({ title: requirePair(pair(b, 'title', 140)), note: pair(b, 'note', 300) })
    run(
      `INSERT INTO awards (student_id, title_en, title_kn, note_en, note_kn, category, level, medal, award_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      student.id, f.title.en, f.title.kn, f.note.en, f.note.kn,
      oneOf(b.category, awardCategories), oneOf(b.level, awardLevels), oneOf(b.medal, awardMedals), awardDate, req.user.id,
    )
    res.json({ ok: true })
  }),
)

api.delete('/teacher/awards/:id', teacher, (req, res) => {
  run('DELETE FROM awards WHERE id = ?', id(req.params.id))
  res.json({ ok: true })
})

api.put('/teacher/attendance', teacher, (req, res) => {
  const day = date(req.body.date)
  if (day > isoDate()) throw bad('invalid.date')
  const valid = new Set(students().map((s) => s.id))
  transaction(() => {
    for (const [sid, status] of Object.entries(req.body.marks ?? {})) {
      if (!valid.has(Number(sid))) continue
      if (status === null) run('DELETE FROM attendance WHERE student_id = ? AND date = ?', Number(sid), day)
      else if (['P', 'A', 'H'].includes(status)) {
        run(
          'INSERT INTO attendance (student_id, date, status) VALUES (?, ?, ?) ON CONFLICT (student_id, date) DO UPDATE SET status = excluded.status',
          Number(sid), day, status,
        )
      }
    }
  })
  res.json({ ok: true })
})

api.post(
  '/teacher/students',
  teacher,
  wrap(async (req, res) => {
    const b = req.body
    const email = required(b.email, 200).toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('invalid.email')
    if (one('SELECT 1 FROM users WHERE email = ?', email)) throw bad('email.taken')
    const password = String(b.password ?? '')
    if (password.length < 8) throw bad('auth.shortPassword')
    const name = required(b.name, 80)
    const first = name.split(/\s+/)[0]
    const f = await bilingual({ first: { en: first, kn: '' } })
    addStudent({ name, first: f.first, email, password, roll: text(b.rollNo, 20), guardian: text(b.guardian, 80), phone: text(b.phone, 40) })
    res.json({ ok: true })
  }),
)

// ---------- Misc ----------

api.get('/health', (_req, res) => res.json({ ok: true, ai: aiEnabled(), provider: aiEnabled() ? PROVIDER : null, model: aiEnabled() ? MODEL : null }))

api.use((_req, res) => res.status(404).json({ error: 'not.found' }))

// eslint-disable-next-line no-unused-vars
api.use((err, _req, res, _next) => {
  if (isAIError(err)) {
    console.error('AI provider error:', err.status, err.message)
    err = new HttpError(502, aiErrorCode(err))
  }
  const status = err.status ?? (err.type === 'entity.parse.failed' ? 400 : 500)
  // Our own errors carry a code the app can show; anything unexpected is logged and hidden.
  const known = err instanceof HttpError || status < 500
  if (!known) console.error(err)
  if (res.headersSent) return res.end()
  res.status(status).json({ error: known ? err.message : 'server.error' })
})

