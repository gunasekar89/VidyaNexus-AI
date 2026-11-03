// The school operations API: every module router plus a combined approvals
// queue ("what is waiting for me").
import express from 'express'
import { one } from '../db.js'
import { registerAccounting } from './accounting.js'
import { registerAdmissions } from './admissions.js'
import { registerCare } from './care.js'
import { registerComms } from './comms.js'
import { requireWorkspace } from './common.js'
import { registerFees } from './fees.js'
import { registerLibrary, registerLookups, registerReception } from './frontdesk.js'
import { registerHr } from './hr.js'
import { registerProcurement } from './procurement.js'
import { registerTransport } from './transport.js'

export { webhookHandler } from './fees.js'

export const ops = express.Router()
ops.use(express.json({ limit: '200kb' }))

registerLookups(ops)
registerAdmissions(ops)
registerFees(ops)
registerAccounting(ops)
registerHr(ops)
registerTransport(ops)
registerProcurement(ops)
registerLibrary(ops)
registerReception(ops)
registerCare(ops)
registerComms(ops)

// Items waiting for this person's decision, across modules. Things they asked
// for themselves are left out: someone else has to approve those.
ops.get('/approvals', requireWorkspace, (req, res) => {
  const s = req.ctx.schoolId
  const me = req.user.id
  const has = (p) => req.ctx.perms.has(p)
  const n = (sql, ...p) => one(sql, ...p).n
  const items = []
  if (!s) return res.json({ items, total: 0 })
  const add = (key, perm, link, count) => has(perm) && count && items.push({ key, link, count })
  add('concessions', 'fees.approve', '/fees?tab=approvals', has('fees.approve') && n("SELECT COUNT(*) AS n FROM fee_concessions WHERE school_id = ? AND status = 'pending' AND requested_by != ?", s, me))
  add('refunds', 'fees.approve', '/fees?tab=approvals', has('fees.approve') && n("SELECT COUNT(*) AS n FROM fee_refunds WHERE school_id = ? AND status = 'requested' AND requested_by != ?", s, me))
  add('journals', 'accounts.approve', '/accounts?tab=drafts', has('accounts.approve') && n("SELECT COUNT(*) AS n FROM journal_drafts WHERE school_id = ? AND status = 'pending' AND prepared_by != ?", s, me))
  add('leave', 'leave.approve', '/leave-approvals', has('leave.approve') && n("SELECT COUNT(*) AS n FROM leave_requests l JOIN employees e ON e.id = l.employee_id WHERE l.school_id = ? AND l.status = 'pending' AND e.user_id != ?", s, me))
  add('payroll', 'payroll.approve', '/payroll', has('payroll.approve') && n("SELECT COUNT(*) AS n FROM payroll_runs WHERE school_id = ? AND status = 'draft' AND prepared_by != ?", s, me))
  add('requisitions', 'procurement.approve', '/purchasing', has('procurement.approve') && n("SELECT COUNT(*) AS n FROM requisitions WHERE school_id = ? AND status = 'submitted' AND requested_by != ?", s, me))
  add('invoices', 'procurement.approve', '/purchasing?tab=invoices', has('procurement.approve') && n("SELECT COUNT(*) AS n FROM vendor_invoices WHERE school_id = ? AND status IN ('matched', 'mismatch') AND recorded_by != ?", s, me))
  add('messages', 'messages.approve', '/messages', has('messages.approve') && n("SELECT COUNT(*) AS n FROM messages WHERE school_id = ? AND status = 'pending_approval' AND created_by != ?", s, me))
  add('pickups', 'visitors.manage', '/reception', has('visitors.manage') && n("SELECT COUNT(*) AS n FROM pickup_requests WHERE school_id = ? AND status = 'waiting'", s))
  add('tickets', 'helpdesk.manage', '/helpdesk', has('helpdesk.manage') && n(`SELECT COUNT(*) AS n FROM tickets WHERE school_id = ? AND status IN ('open', 'in_progress') ${has('helpdesk.grievance') ? '' : "AND category != 'grievance'"}`, s))
  add('safeguarding', 'safeguarding.view', '/safeguarding', has('safeguarding.view') && n("SELECT COUNT(*) AS n FROM safeguarding_cases WHERE school_id = ? AND status != 'closed'", s))
  res.json({ items, total: items.reduce((a, i) => a + i.count, 0) })
})
