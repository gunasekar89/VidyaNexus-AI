import crypto from 'node:crypto'
import { ROLES, WORKSPACE_KINDS, isPrivilegedRole, legacyRoleFor, roleLabel } from '../shared/roles.js'
import { all, one, run } from './db.js'
import { isoDate } from './dates.js'

// ---------- Audit ----------

export function audit(req, action, { entityType = '', entityId = '', outcome = 'ok', detail = {}, schoolId, userId } = {}) {
  run(
    `INSERT INTO audit_events (actor_user_id, membership_id, school_id, action, entity_type, entity_id, outcome, detail, ip, request_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    userId ?? req?.user?.id ?? null,
    req?.ctx?.membership?.id ?? null,
    schoolId ?? req?.ctx?.schoolId ?? null,
    action,
    entityType,
    String(entityId ?? ''),
    outcome,
    JSON.stringify(detail),
    req?.ip ?? '',
    req?.id ?? '',
  )
}

export function requestId(req, res, next) {
  req.id = crypto.randomUUID()
  res.setHeader('X-Request-Id', req.id)
  next()
}

// ---------- Memberships ----------

const ACTIVE_MEMBERSHIP = `
  m.status = 'active' AND m.valid_from <= :today AND (m.valid_to IS NULL OR m.valid_to >= :today)
  AND (m.school_id IS NULL OR EXISTS (SELECT 1 FROM schools s WHERE s.id = m.school_id AND s.status = 'active'))`

export function activeMemberships(userId) {
  return all(
    `SELECT m.*, s.code AS school_code, s.name_en AS school_name_en, s.name_kn AS school_name_kn,
            g.code AS group_code, g.name AS group_name
     FROM memberships m
     LEFT JOIN schools s ON s.id = m.school_id
     LEFT JOIN school_groups g ON g.id = m.group_id
     WHERE m.user_id = :user AND ${ACTIVE_MEMBERSHIP} AND m.role IN (${Object.keys(ROLES).map((r) => `'${r}'`).join(',')})
     ORDER BY m.id`,
    { user: userId, today: isoDate() },
  )
}

export function workspaceOf(m) {
  const def = ROLES[m.role]
  return {
    id: m.id,
    role: m.role,
    roleLabel: roleLabel(m.role),
    kind: def.kind,
    kindLabel: { en: WORKSPACE_KINDS[def.kind].en, kn: WORKSPACE_KINDS[def.kind].kn },
    cards: WORKSPACE_KINDS[def.kind].cards,
    privileged: isPrivilegedRole(m.role),
    school: m.school_id ? { id: m.school_id, code: m.school_code, name: { en: m.school_name_en, kn: m.school_name_kn } } : null,
    group: m.group_id ? { id: m.group_id, code: m.group_code, name: m.group_name } : null,
  }
}

export const listWorkspaces = (userId) => activeMemberships(userId).map(workspaceOf)

export function currentYear(schoolId) {
  return one("SELECT * FROM academic_years WHERE school_id = ? AND status = 'current'", schoolId)
}

// Builds req.ctx from the session's chosen membership. Everything is re-read
// and re-verified on every request: a URL, a cached screen or the entry card
// cannot add permissions.
export function loadContext(req, _res, next) {
  req.ctx = null
  const u = req.user
  if (!u || !u.active_membership_id) return next()
  const m = activeMemberships(u.id).find((x) => x.id === u.active_membership_id)
  if (!m) {
    run('UPDATE sessions SET active_membership_id = NULL WHERE token = ?', u.token)
    return next()
  }
  const def = ROLES[m.role]
  const grants = all('SELECT permission FROM membership_grants WHERE membership_id = ?', m.id).map((r) => r.permission)
  const scopes = all('SELECT scope_type, scope_id FROM membership_scopes WHERE membership_id = ?', m.id)
  const schoolIds = m.school_id ? [m.school_id] : all('SELECT id FROM schools WHERE group_id = ? AND status = ?', m.group_id, 'active').map((r) => r.id)
  const privileged = isPrivilegedRole(m.role)
  const ctx = {
    membership: m,
    role: m.role,
    kind: def.kind,
    schoolId: m.school_id ?? null,
    groupId: m.group_id ?? null,
    schoolIds,
    perms: new Set([...def.perms, ...grants]),
    sectionIds: scopes.filter((s) => s.scope_type === 'section').map((s) => s.scope_id),
    privileged,
    mfaPending: privileged && !u.mfa_at,
  }
  if (def.kind === 'learner') {
    const year = currentYear(m.school_id)
    ctx.enrollment = year
      ? one("SELECT * FROM enrollments WHERE school_id = ? AND student_user_id = ? AND academic_year_id = ? AND status = 'active'", m.school_id, u.id, year.id)
      : null
  }
  req.ctx = ctx
  next()
}

export const legacyRole = (req) => (req.ctx ? legacyRoleFor(req.ctx.kind) : 'none')

// Route guard: the active, verified membership must carry the permission.
export const requirePerm = (perm) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'auth.required' })
  const ctx = req.ctx
  if (!ctx) return res.status(403).json({ error: 'workspace.required' })
  if (ctx.mfaPending) return res.status(403).json({ error: 'mfa.required' })
  if (!ctx.perms.has(perm)) {
    audit(req, 'access.denied', { outcome: 'denied', detail: { perm, path: req.originalUrl.split('?')[0] } })
    return res.status(403).json({ error: 'auth.forbidden' })
  }
  if (perm === 'learning.study' && !ctx.enrollment) return res.status(403).json({ error: 'enrollment.missing' })
  next()
}

// ---------- Scope helpers ----------

// Students a teacher (or any section-scoped member) may work with.
export function sectionStudents(ctx) {
  if (!ctx.sectionIds.length) return []
  const year = currentYear(ctx.schoolId)
  if (!year) return []
  return all(
    `SELECT u.*, e.section_id, e.admission_no, e.roll_no AS enrollment_roll FROM enrollments e JOIN users u ON u.id = e.student_user_id
     WHERE e.school_id = ? AND e.academic_year_id = ? AND e.status = 'active'
       AND e.section_id IN (${ctx.sectionIds.map(() => '?').join(',')})
     ORDER BY u.name`,
    ctx.schoolId,
    year.id,
    ...ctx.sectionIds,
  )
}

// Guardian links that are verified and active for this guardian in this school.
export function guardianChildren(ctx, guardianUserId) {
  const year = currentYear(ctx.schoolId)
  return all(
    `SELECT l.*, u.name, u.first_name_en, u.first_name_kn, u.avatar, e.section_id, e.admission_no, e.roll_no AS enrollment_roll,
            sec.label_en AS section_en, sec.label_kn AS section_kn
     FROM guardian_links l
     JOIN users u ON u.id = l.student_user_id
     LEFT JOIN enrollments e ON e.student_user_id = l.student_user_id AND e.school_id = l.school_id AND e.academic_year_id = ? AND e.status = 'active'
     LEFT JOIN sections sec ON sec.id = e.section_id
     WHERE l.school_id = ? AND l.guardian_user_id = ? AND l.status = 'active' AND l.verified_at IS NOT NULL
     ORDER BY u.name`,
    year?.id ?? -1,
    ctx.schoolId,
    guardianUserId,
  )
}
