// Accounting: chart of accounts, journals (automatic and manual), maker-checker
// approval for manual entries, reversals, period locks, ledger and trial balance.
import { audit, requirePerm } from '../access.js'
import { all, one, run, transaction } from '../db.js'
import { isoDate } from '../dates.js'
import { bad, id, notFound, required } from '../http.js'
import { CHART, checkVersion, conflict, date, ensureChart, isLocked, notSelf, notify, paise, postJournal, reverseJournal, schoolOf, usersWithPerm } from './common.js'

const NORMAL_DEBIT = new Set(['asset', 'expense'])

function balances(schoolId, { from, to } = {}) {
  ensureChart(schoolId)
  const cond = [from ? 'j.entry_date >= :from' : '', to ? 'j.entry_date <= :to' : ''].filter(Boolean).join(' AND ')
  return all(
    `SELECT a.id, a.code, a.name_en, a.name_kn, a.type,
            COALESCE(SUM(l.debit_paise), 0) AS dr, COALESCE(SUM(l.credit_paise), 0) AS cr
     FROM ledger_accounts a
     LEFT JOIN journal_lines l ON l.account_id = a.id AND l.journal_id IN (SELECT j.id FROM journals j WHERE j.school_id = :school ${cond ? `AND ${cond}` : ''})
     WHERE a.school_id = :school GROUP BY a.id ORDER BY a.code`,
    { school: schoolId, ...(from ? { from } : {}), ...(to ? { to } : {}) },
  ).map((a) => ({
    id: a.id,
    code: a.code,
    name: { en: a.name_en, kn: a.name_kn },
    type: a.type,
    debitPaise: a.dr,
    creditPaise: a.cr,
    // Positive means the account's normal side (debit for assets/expenses).
    balancePaise: NORMAL_DEBIT.has(a.type) ? a.dr - a.cr : a.cr - a.dr,
  }))
}

function journalView(j) {
  return {
    id: j.id,
    number: j.number,
    date: j.entry_date,
    narration: j.narration,
    source: j.source,
    sourceRef: j.source_ref,
    reversesId: j.reverses_id,
    reversed: Boolean(one('SELECT 1 AS x FROM journals WHERE reverses_id = ?', j.id)),
    preparedBy: j.prepared_name ?? '',
    approvedBy: j.approved_name ?? '',
    lines: all(
      'SELECT a.code, a.name_en, a.name_kn, l.debit_paise, l.credit_paise FROM journal_lines l JOIN ledger_accounts a ON a.id = l.account_id WHERE l.journal_id = ? ORDER BY l.id',
      j.id,
    ).map((l) => ({ code: l.code, name: { en: l.name_en, kn: l.name_kn }, debitPaise: l.debit_paise, creditPaise: l.credit_paise })),
  }
}

function parseLines(schoolId, lines) {
  if (!Array.isArray(lines) || lines.length < 2 || lines.length > 20) throw bad('journal.lines')
  const out = lines.map((l) => {
    if (!one('SELECT 1 AS x FROM ledger_accounts WHERE school_id = ? AND code = ?', schoolId, String(l.account))) throw bad('account.unknown')
    const debit = l.debitPaise ? paise(l.debitPaise) : 0
    const credit = l.creditPaise ? paise(l.creditPaise) : 0
    if ((debit > 0) === (credit > 0)) throw bad('journal.line_side')
    return { account: String(l.account), debit, credit }
  })
  const dr = out.reduce((s, l) => s + l.debit, 0)
  const cr = out.reduce((s, l) => s + l.credit, 0)
  if (dr !== cr) throw bad('journal.unbalanced')
  return out
}

const draftView = (d) => ({
  id: d.id,
  date: d.entry_date,
  narration: d.narration,
  lines: JSON.parse(d.lines),
  status: d.status,
  preparedBy: d.prepared_name,
  decidedBy: d.decided_name ?? '',
  mine: d.mine,
  reversesId: d.reverses_id,
  journalId: d.journal_id,
  version: d.version,
})

export function registerAccounting(r) {
  r.get('/accounts/summary', requirePerm('accounts.view'), (req, res) => {
    const s = schoolOf(req)
    const b = balances(s)
    const sum = (pred) => b.filter(pred).reduce((a, x) => a + x.balancePaise, 0)
    const tb = b.reduce((a, x) => ({ dr: a.dr + x.debitPaise, cr: a.cr + x.creditPaise }), { dr: 0, cr: 0 })
    res.json({
      incomePaise: sum((a) => a.type === 'income'),
      expensePaise: sum((a) => a.type === 'expense'),
      cashPaise: sum((a) => a.code === '1000'),
      bankPaise: sum((a) => a.code === '1010' || a.code === '1020'),
      receivablePaise: sum((a) => a.code === '1100'),
      payablePaise: sum((a) => a.code === '2100' || a.code === '2200' || a.code === '2300'),
      advancePaise: sum((a) => a.code === '2000'),
      balanced: tb.dr === tb.cr,
      journals: one('SELECT COUNT(*) AS n FROM journals WHERE school_id = ?', s).n,
      pendingDrafts: one("SELECT COUNT(*) AS n FROM journal_drafts WHERE school_id = ? AND status = 'pending'", s).n,
      locks: all('SELECT month FROM period_locks WHERE school_id = ? ORDER BY month DESC', s).map((l) => l.month),
    })
  })

  r.get('/accounts/chart', requirePerm('accounts.view'), (req, res) => res.json({ accounts: balances(schoolOf(req)) }))

  r.get('/accounts/trial-balance', requirePerm('accounts.view'), (req, res) => {
    const s = schoolOf(req)
    const to = req.query.to ? date(req.query.to) : isoDate()
    const rows = balances(s, { to }).filter((a) => a.debitPaise || a.creditPaise)
    const lines = rows.map((a) => {
      const net = a.debitPaise - a.creditPaise
      return { code: a.code, name: a.name, type: a.type, debitPaise: net > 0 ? net : 0, creditPaise: net < 0 ? -net : 0 }
    })
    const totals = lines.reduce((t, l) => ({ debitPaise: t.debitPaise + l.debitPaise, creditPaise: t.creditPaise + l.creditPaise }), { debitPaise: 0, creditPaise: 0 })
    res.json({ to, lines, totals, balanced: totals.debitPaise === totals.creditPaise })
  })

  r.get('/accounts/journals', requirePerm('accounts.view'), (req, res) => {
    const s = schoolOf(req)
    const code = req.query.account ? String(req.query.account) : null
    const rows = all(
      `SELECT j.*, p.name AS prepared_name, a.name AS approved_name FROM journals j LEFT JOIN users p ON p.id = j.prepared_by LEFT JOIN users a ON a.id = j.approved_by
       WHERE j.school_id = ? ${code ? 'AND j.id IN (SELECT l.journal_id FROM journal_lines l JOIN ledger_accounts la ON la.id = l.account_id WHERE la.code = ? AND la.school_id = j.school_id)' : ''}
       ORDER BY j.id DESC LIMIT 150`,
      ...[s, ...(code ? [code] : [])],
    )
    res.json({ journals: rows.map(journalView) })
  })

  r.get('/accounts/drafts', requirePerm('accounts.view'), (req, res) => {
    const s = schoolOf(req)
    res.json({
      canPost: req.ctx.perms.has('accounts.post'),
      canApprove: req.ctx.perms.has('accounts.approve'),
      accounts: CHART.map(([code, en, kn, type]) => ({ code, name: { en, kn }, type })),
      drafts: all(
        `SELECT d.*, p.name AS prepared_name, x.name AS decided_name, d.prepared_by = ? AS mine FROM journal_drafts d JOIN users p ON p.id = d.prepared_by
         LEFT JOIN users x ON x.id = d.decided_by WHERE d.school_id = ? ORDER BY d.status = 'pending' DESC, d.id DESC LIMIT 100`,
        req.user.id, s,
      ).map(draftView),
    })
  })

  // A manual journal waits for a second person.
  r.post('/accounts/drafts', requirePerm('accounts.post'), (req, res) => {
    const s = schoolOf(req)
    ensureChart(s)
    const entryDate = req.body.date ? date(req.body.date) : isoDate()
    if (isLocked(s, entryDate)) throw conflict('period.locked')
    const lines = parseLines(s, req.body.lines)
    const did = Number(
      run('INSERT INTO journal_drafts (school_id, entry_date, narration, lines, prepared_by) VALUES (?, ?, ?, ?, ?)', s, entryDate, required(req.body.narration, 200), JSON.stringify(lines), req.user.id).lastInsertRowid,
    )
    notify(s, usersWithPerm(s, 'accounts.approve').filter((u) => u !== req.user.id), {
      title: { en: 'Journal to approve', kn: 'ಅನುಮೋದಿಸಬೇಕಾದ ಜರ್ನಲ್' },
      body: { en: req.body.narration, kn: req.body.narration },
      link: '/accounts?tab=drafts',
      source: `draft:${did}`,
      kind: 'approval',
    })
    audit(req, 'accounts.draft_created', { entityType: 'journal_draft', entityId: did })
    res.status(201).json({ id: did })
  })

  // Reversing a posted journal is itself a manual entry needing approval.
  r.post('/accounts/journals/:id/reverse', requirePerm('accounts.post'), (req, res) => {
    const s = schoolOf(req)
    const j = one('SELECT * FROM journals WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!j) throw notFound()
    if (one('SELECT 1 AS x FROM journals WHERE reverses_id = ?', j.id) || one("SELECT 1 AS x FROM journal_drafts WHERE reverses_id = ? AND status = 'pending'", j.id)) throw conflict('journal.already_reversed')
    const reason = required(req.body.reason, 200)
    const lines = all('SELECT a.code AS account, l.credit_paise AS debit, l.debit_paise AS credit FROM journal_lines l JOIN ledger_accounts a ON a.id = l.account_id WHERE l.journal_id = ?', j.id)
    const did = Number(
      run('INSERT INTO journal_drafts (school_id, entry_date, narration, lines, prepared_by, reverses_id) VALUES (?, ?, ?, ?, ?, ?)', s, isoDate(), `Reversal of ${j.number}: ${reason}`, JSON.stringify(lines), req.user.id, j.id).lastInsertRowid,
    )
    audit(req, 'accounts.reversal_requested', { entityType: 'journal', entityId: j.id, detail: { reason } })
    res.status(201).json({ id: did })
  })

  r.post('/accounts/drafts/:id/decide', requirePerm('accounts.approve'), (req, res) => {
    const s = schoolOf(req)
    const d = one('SELECT * FROM journal_drafts WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!d) throw notFound()
    checkVersion(d, req.body.version)
    if (d.status !== 'pending') throw conflict('already.decided')
    notSelf(d.prepared_by, req.user.id)
    const approve = req.body.approve === true
    const jid = transaction(() => {
      let journalId = null
      if (approve) {
        journalId = d.reverses_id
          ? reverseJournal(s, d.reverses_id, { narration: d.narration, sourceRef: `draft:${d.id}`, preparedBy: d.prepared_by, approvedBy: req.user.id })
          : postJournal({ schoolId: s, entryDate: d.entry_date, narration: d.narration, source: 'manual', sourceRef: `draft:${d.id}`, lines: JSON.parse(d.lines), preparedBy: d.prepared_by, approvedBy: req.user.id })
      }
      run('UPDATE journal_drafts SET status = ?, decided_by = ?, journal_id = ?, version = version + 1 WHERE id = ?', approve ? 'approved' : 'rejected', req.user.id, journalId, d.id)
      return journalId
    })
    audit(req, approve ? 'accounts.draft_approved' : 'accounts.draft_rejected', { entityType: 'journal_draft', entityId: d.id, detail: { journalId: jid } })
    res.json({ ok: true, journalId: jid })
  })

  // Locking a month stops any new entry dated in it. Unlocking needs an approver.
  r.post('/accounts/locks', requirePerm('accounts.post'), (req, res) => {
    const s = schoolOf(req)
    const month = String(req.body.month ?? '')
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw bad('invalid.month')
    if (month >= isoDate().slice(0, 7)) throw bad('lock.current_month')
    run('INSERT OR IGNORE INTO period_locks (school_id, month, locked_by) VALUES (?, ?, ?)', s, month, req.user.id)
    audit(req, 'accounts.period_locked', { entityType: 'period', entityId: month })
    res.json({ ok: true })
  })

  r.delete('/accounts/locks/:month', requirePerm('accounts.approve'), (req, res) => {
    const s = schoolOf(req)
    const lock = one('SELECT * FROM period_locks WHERE school_id = ? AND month = ?', s, req.params.month)
    if (!lock) throw notFound()
    run('DELETE FROM period_locks WHERE school_id = ? AND month = ?', s, lock.month)
    audit(req, 'accounts.period_unlocked', { entityType: 'period', entityId: lock.month })
    res.json({ ok: true })
  })
}
