// 002: identity, organisation structure, memberships and audit.
//
// - Accounts (users) are now separate from what a person may do. Permissions
//   come from memberships: user + school (or school group) + role + scopes.
// - Organisation: school group → legal entity → school → campus, with academic
//   years (separate from financial years), terms, grades, sections, departments.
// - Students are enrolled per academic year; employees have an employment record.
// - Guardians are linked to children with explicit, verifiable permissions.
// - Shared learning content gets a school_id (and optional section) so every
//   query can be limited to one tenant.
export const id = '002-identity-tenancy'

export const sql = `
-- Accounts: widen the legacy role column (it is now only a hint for old data)
-- and add mobile login, MFA and account disabling.
CREATE TABLE users_new (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  mobile TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'none' CHECK (role IN ('student', 'teacher', 'guardian', 'staff', 'admin', 'none')),
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
  mfa_secret TEXT,
  mfa_enabled_at TEXT,
  mfa_last_step INTEGER,
  disabled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO users_new (id, email, password_hash, role, name, first_name_en, first_name_kn, class_name_en, class_name_kn,
  school_en, school_kn, roll_no, guardian, phone, avatar, lang, created_at)
SELECT id, email, password_hash, role, name, first_name_en, first_name_kn, class_name_en, class_name_kn,
  school_en, school_kn, roll_no, guardian, phone, avatar, lang, created_at FROM users;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

ALTER TABLE sessions ADD COLUMN active_membership_id INTEGER REFERENCES memberships(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN mfa_at TEXT;
ALTER TABLE sessions ADD COLUMN portal TEXT;
ALTER TABLE sessions ADD COLUMN created_at TEXT;

-- Organisation structure.
CREATE TABLE school_groups (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE legal_entities (
  id INTEGER PRIMARY KEY,
  group_id INTEGER REFERENCES school_groups(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'trust' CHECK (kind IN ('trust', 'society', 'company', 'other')),
  registration_no TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE schools (
  id INTEGER PRIMARY KEY,
  group_id INTEGER REFERENCES school_groups(id),
  legal_entity_id INTEGER REFERENCES legal_entities(id),
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name_en TEXT NOT NULL,
  name_kn TEXT NOT NULL,
  board TEXT NOT NULL DEFAULT 'karnataka-state',
  email_domain TEXT UNIQUE COLLATE NOCASE,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  languages TEXT NOT NULL DEFAULT 'en,kn',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'offboarded')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE campuses (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  code TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_kn TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  UNIQUE (school_id, code),
  UNIQUE (school_id, id)
);
CREATE TABLE departments (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  name_en TEXT NOT NULL,
  name_kn TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'academic' CHECK (kind IN ('academic', 'administrative', 'operations')),
  UNIQUE (school_id, name_en),
  UNIQUE (school_id, id)
);
-- Academic years run June–April in Karnataka; financial years run April–March.
-- They are deliberately separate records.
CREATE TABLE academic_years (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  label TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'current', 'closed')),
  UNIQUE (school_id, label),
  UNIQUE (school_id, id),
  CHECK (ends_on > starts_on)
);
CREATE UNIQUE INDEX one_current_year ON academic_years (school_id) WHERE status = 'current';
CREATE TABLE financial_years (
  id INTEGER PRIMARY KEY,
  legal_entity_id INTEGER NOT NULL REFERENCES legal_entities(id),
  label TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closing', 'closed')),
  UNIQUE (legal_entity_id, label)
);
CREATE TABLE terms (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL,
  academic_year_id INTEGER NOT NULL,
  name_en TEXT NOT NULL,
  name_kn TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  FOREIGN KEY (school_id, academic_year_id) REFERENCES academic_years (school_id, id)
);
CREATE TABLE grades (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  level INTEGER NOT NULL CHECK (level BETWEEN 0 AND 12),
  name_en TEXT NOT NULL,
  name_kn TEXT NOT NULL,
  UNIQUE (school_id, level),
  UNIQUE (school_id, id)
);
CREATE TABLE sections (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL,
  campus_id INTEGER NOT NULL,
  academic_year_id INTEGER NOT NULL,
  grade_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  label_en TEXT NOT NULL,
  label_kn TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 40 CHECK (capacity > 0),
  UNIQUE (academic_year_id, grade_id, name),
  UNIQUE (school_id, id),
  -- Tenant-aware keys: a section can only point at its own school's records.
  FOREIGN KEY (school_id, campus_id) REFERENCES campuses (school_id, id),
  FOREIGN KEY (school_id, academic_year_id) REFERENCES academic_years (school_id, id),
  FOREIGN KEY (school_id, grade_id) REFERENCES grades (school_id, id)
);

-- People in a school. The user row is the stable identity across years and transfers.
CREATE TABLE enrollments (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL,
  student_user_id INTEGER NOT NULL REFERENCES users(id),
  academic_year_id INTEGER NOT NULL,
  section_id INTEGER NOT NULL,
  admission_no TEXT NOT NULL,
  roll_no TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'promoted', 'repeated', 'transferred', 'withdrawn', 'completed')),
  starts_on TEXT NOT NULL,
  ends_on TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, student_user_id, academic_year_id),
  FOREIGN KEY (school_id, academic_year_id) REFERENCES academic_years (school_id, id),
  FOREIGN KEY (school_id, section_id) REFERENCES sections (school_id, id)
);
CREATE INDEX enrollments_section ON enrollments (section_id, status);
CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  employee_no TEXT NOT NULL,
  staff_type TEXT NOT NULL CHECK (staff_type IN ('teaching', 'non_teaching', 'contractor')),
  department_id INTEGER,
  designation_en TEXT NOT NULL DEFAULT '',
  designation_kn TEXT NOT NULL DEFAULT '',
  joined_on TEXT,
  left_on TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_leave', 'exited')),
  UNIQUE (school_id, employee_no),
  UNIQUE (school_id, user_id),
  UNIQUE (school_id, id),
  FOREIGN KEY (school_id, department_id) REFERENCES departments (school_id, id)
);
-- Restricted: salaries and bank details. Effective-dated, amounts in paise.
CREATE TABLE employee_compensation (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  effective_from TEXT NOT NULL,
  monthly_gross_paise INTEGER NOT NULL CHECK (monthly_gross_paise >= 0),
  bank_account_last4 TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (employee_id, effective_from),
  FOREIGN KEY (school_id, employee_id) REFERENCES employees (school_id, id)
);

-- Memberships: the only source of permissions.
CREATE TABLE memberships (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  group_id INTEGER REFERENCES school_groups(id),
  school_id INTEGER REFERENCES schools(id),
  campus_id INTEGER REFERENCES campuses(id),
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'ended')),
  valid_from TEXT NOT NULL DEFAULT (date('now')),
  valid_to TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((group_id IS NULL) <> (school_id IS NULL))
);
CREATE UNIQUE INDEX memberships_unique_active ON memberships (user_id, coalesce(school_id, 0), coalesce(group_id, 0), role) WHERE status = 'active';
-- Narrows a membership to particular sections, departments or campuses.
CREATE TABLE membership_scopes (
  membership_id INTEGER NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('section', 'department', 'campus')),
  scope_id INTEGER NOT NULL,
  PRIMARY KEY (membership_id, scope_type, scope_id)
);
-- Explicit extra permissions (for example a sensitive one), always with a reason.
CREATE TABLE membership_grants (
  membership_id INTEGER NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  reason TEXT NOT NULL,
  granted_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (membership_id, permission)
);
-- Login IDs such as admission numbers and employee numbers, unique per school.
CREATE TABLE login_identifiers (
  school_id INTEGER NOT NULL REFERENCES schools(id),
  kind TEXT NOT NULL CHECK (kind IN ('student_id', 'employee_id')),
  value TEXT NOT NULL COLLATE NOCASE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (school_id, kind, value)
);

-- Guardians linked to children, with what each link allows.
CREATE TABLE guardian_links (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  guardian_user_id INTEGER NOT NULL REFERENCES users(id),
  student_user_id INTEGER NOT NULL REFERENCES users(id),
  relationship TEXT NOT NULL CHECK (relationship IN ('mother', 'father', 'guardian', 'grandparent', 'other')),
  is_primary INTEGER NOT NULL DEFAULT 0,
  can_pickup INTEGER NOT NULL DEFAULT 0,
  can_view_fees INTEGER NOT NULL DEFAULT 0,
  can_view_health INTEGER NOT NULL DEFAULT 0,
  can_receive_comms INTEGER NOT NULL DEFAULT 1,
  restriction_note TEXT NOT NULL DEFAULT '',
  verified_at TEXT,
  verified_by INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'ended')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, guardian_user_id, student_user_id),
  CHECK (guardian_user_id <> student_user_id)
);

-- Restricted student notes. Each kind needs its own permission.
CREATE TABLE student_notes (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  student_user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('health', 'counseling', 'safeguarding')),
  body TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Invitation-based onboarding (there is no open sign-up for staff or admins).
CREATE TABLE invitations (
  id INTEGER PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  email TEXT NOT NULL COLLATE NOCASE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '[]',
  token_hash TEXT NOT NULL UNIQUE,
  invited_by INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  accepted_user_id INTEGER REFERENCES users(id),
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Messages waiting for a delivery channel (email/SMS adapters are not connected yet).
CREATE TABLE outbox (
  id INTEGER PRIMARY KEY,
  school_id INTEGER REFERENCES schools(id),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp', 'push')),
  recipient TEXT NOT NULL,
  template TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT
);

-- Append-only audit trail.
CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actor_user_id INTEGER,
  membership_id INTEGER,
  school_id INTEGER,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  outcome TEXT NOT NULL DEFAULT 'ok' CHECK (outcome IN ('ok', 'denied', 'failed')),
  detail TEXT NOT NULL DEFAULT '{}',
  ip TEXT NOT NULL DEFAULT '',
  request_id TEXT NOT NULL DEFAULT ''
);
CREATE INDEX audit_school_time ON audit_events (school_id, id DESC);
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit events are append-only'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit events are append-only'); END;

-- Tenant columns on the existing learning records. NULL means "not yet
-- assigned to a school" and is never shown to anyone; startup backfills them.
ALTER TABLE homework ADD COLUMN school_id INTEGER REFERENCES schools(id);
ALTER TABLE homework ADD COLUMN section_id INTEGER REFERENCES sections(id);
ALTER TABLE announcements ADD COLUMN school_id INTEGER REFERENCES schools(id);
ALTER TABLE announcements ADD COLUMN section_id INTEGER REFERENCES sections(id);
ALTER TABLE exams ADD COLUMN school_id INTEGER REFERENCES schools(id);
ALTER TABLE exams ADD COLUMN section_id INTEGER REFERENCES sections(id);
ALTER TABLE results ADD COLUMN school_id INTEGER REFERENCES schools(id);
ALTER TABLE awards ADD COLUMN school_id INTEGER REFERENCES schools(id);
ALTER TABLE attendance ADD COLUMN school_id INTEGER REFERENCES schools(id);
`
