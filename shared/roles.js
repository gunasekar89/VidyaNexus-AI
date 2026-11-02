// Role and permission catalogue, shared by the server (which enforces it) and
// the web app (which only uses it for labels and navigation).
//
// The entry card a person picks on the home page is navigation only. What a
// person can do always comes from their verified memberships on the server.

// Workspace kinds. Each entry card offers the workspaces of these kinds.
export const WORKSPACE_KINDS = {
  admin: { en: 'School administration', kn: 'ಶಾಲಾ ಆಡಳಿತ', cards: ['admin'] },
  learner: { en: 'Student', kn: 'ವಿದ್ಯಾರ್ಥಿ', cards: ['family'] },
  guardian: { en: 'Parent / guardian', kn: 'ಪೋಷಕರು', cards: ['family'] },
  teacher: { en: 'Teacher workspace', kn: 'ಶಿಕ್ಷಕರ ಕಾರ್ಯಕ್ಷೇತ್ರ', cards: ['staff'] },
  // Non-teaching employees reach a simple self-service workspace from either staff route.
  worker: { en: 'Staff self-service', kn: 'ಸಿಬ್ಬಂದಿ ಸ್ವಸೇವೆ', cards: ['staff', 'admin'] },
}

export const ENTRY_CARDS = ['admin', 'family', 'staff']

// Permissions. `sensitive` ones are never implied by seniority: they come only
// from a role made for that work, or from an explicit, audited grant.
export const PERMISSIONS = {
  'group.view': { en: 'See the school group overview' },
  'school.view': { en: 'See the school overview' },
  'school.configure': { en: 'Change school setup (campuses, years, classes)' },
  'members.view': { en: 'See people and their roles' },
  'members.invite': { en: 'Invite people and assign roles' },
  'members.manage': { en: 'Suspend or end memberships and reset passwords' },
  'audit.view': { en: 'Read the audit log' },
  'students.view': { en: 'See the student register' },
  'guardians.manage': { en: 'Link and verify guardians' },
  'staff.view': { en: 'See the staff directory' },
  'hr.compensation.view': { en: 'See salaries and bank details', sensitive: true },
  'health.view': { en: 'See student health records', sensitive: true },
  'counseling.view': { en: 'See counseling notes', sensitive: true },
  'safeguarding.view': { en: 'See safeguarding cases', sensitive: true },
  'learning.study': { en: 'Use the student learning app' },
  'learning.teach': { en: 'Teach assigned classes (homework, exams, marks, attendance)' },
  'family.view': { en: "See linked children's school information" },
  'self.service': { en: 'Employee self-service' },
}

const ADMIN_BASE = ['school.view']

// level: 'group' memberships sit on a school group, 'school' ones on a school.
export const ROLES = {
  owner_trustee: { kind: 'admin', level: 'group', en: 'Owner / trustee', kn: 'ಮಾಲೀಕರು / ಟ್ರಸ್ಟಿ', perms: ['group.view', 'school.view', 'members.view', 'staff.view', 'audit.view'] },
  group_manager: { kind: 'admin', level: 'group', en: 'Group manager', kn: 'ಸಮೂಹ ವ್ಯವಸ್ಥಾಪಕರು', perms: ['group.view', 'school.view', 'members.view', 'staff.view'] },
  principal: {
    kind: 'admin',
    en: 'Principal',
    kn: 'ಪ್ರಾಂಶುಪಾಲರು',
    perms: [...ADMIN_BASE, 'school.configure', 'members.view', 'members.invite', 'members.manage', 'audit.view', 'students.view', 'guardians.manage', 'staff.view'],
  },
  campus_admin: {
    kind: 'admin',
    en: 'Campus administrator',
    kn: 'ಕ್ಯಾಂಪಸ್ ಆಡಳಿತಾಧಿಕಾರಿ',
    perms: [...ADMIN_BASE, 'school.configure', 'members.view', 'members.invite', 'members.manage', 'audit.view', 'students.view', 'guardians.manage', 'staff.view'],
  },
  admissions: { kind: 'admin', en: 'Admissions officer', kn: 'ಪ್ರವೇಶ ಅಧಿಕಾರಿ', perms: [...ADMIN_BASE, 'students.view', 'guardians.manage'] },
  receptionist: { kind: 'admin', en: 'Receptionist', kn: 'ಸ್ವಾಗತಕಾರರು', perms: [...ADMIN_BASE] },
  accountant: { kind: 'admin', en: 'Accountant', kn: 'ಲೆಕ್ಕಿಗರು', perms: [...ADMIN_BASE, 'students.view'] },
  cashier: { kind: 'admin', en: 'Cashier', kn: 'ನಗದು ಗುಮಾಸ್ತರು', perms: [...ADMIN_BASE] },
  hr: { kind: 'admin', en: 'HR officer', kn: 'ಮಾನವ ಸಂಪನ್ಮೂಲ ಅಧಿಕಾರಿ', perms: [...ADMIN_BASE, 'members.view', 'staff.view', 'hr.compensation.view'] },
  payroll_officer: { kind: 'admin', en: 'Payroll officer', kn: 'ವೇತನ ಅಧಿಕಾರಿ', perms: [...ADMIN_BASE, 'staff.view', 'hr.compensation.view'] },
  academic_coordinator: { kind: 'admin', en: 'Academic coordinator', kn: 'ಶೈಕ್ಷಣಿಕ ಸಂಯೋಜಕರು', perms: [...ADMIN_BASE, 'students.view', 'staff.view'] },
  exam_officer: { kind: 'admin', en: 'Exam officer', kn: 'ಪರೀಕ್ಷಾ ಅಧಿಕಾರಿ', perms: [...ADMIN_BASE, 'students.view'] },
  transport_manager: { kind: 'admin', en: 'Transport manager', kn: 'ಸಾರಿಗೆ ವ್ಯವಸ್ಥಾಪಕರು', perms: [...ADMIN_BASE] },
  safeguarding_officer: { kind: 'admin', en: 'Safeguarding officer', kn: 'ಮಕ್ಕಳ ಸುರಕ್ಷತಾ ಅಧಿಕಾರಿ', perms: [...ADMIN_BASE, 'students.view', 'safeguarding.view'] },
  auditor: { kind: 'admin', en: 'Auditor', kn: 'ಲೆಕ್ಕಪರಿಶೋಧಕರು', perms: [...ADMIN_BASE, 'audit.view'] },
  teacher: { kind: 'teacher', en: 'Teacher', kn: 'ಶಿಕ್ಷಕರು', perms: ['learning.teach', 'self.service'] },
  counselor: { kind: 'worker', en: 'Counselor', kn: 'ಆಪ್ತ ಸಲಹೆಗಾರರು', perms: ['self.service', 'counseling.view'] },
  nurse: { kind: 'worker', en: 'School nurse', kn: 'ಶಾಲಾ ದಾದಿ', perms: ['self.service', 'health.view'] },
  librarian: { kind: 'worker', en: 'Librarian', kn: 'ಗ್ರಂಥಪಾಲಕರು', perms: ['self.service'] },
  driver: { kind: 'worker', en: 'Driver', kn: 'ಚಾಲಕರು', perms: ['self.service'] },
  attendant: { kind: 'worker', en: 'Bus attendant', kn: 'ಬಸ್ ಸಹಾಯಕರು', perms: ['self.service'] },
  hostel_warden: { kind: 'worker', en: 'Hostel warden', kn: 'ವಸತಿ ನಿಲಯ ಪಾಲಕರು', perms: ['self.service'] },
  inventory: { kind: 'worker', en: 'Stores / inventory', kn: 'ದಾಸ್ತಾನು ವಿಭಾಗ', perms: ['self.service'] },
  technician: { kind: 'worker', en: 'Technician', kn: 'ತಂತ್ರಜ್ಞರು', perms: ['self.service'] },
  cleaner: { kind: 'worker', en: 'Housekeeping', kn: 'ಸ್ವಚ್ಛತಾ ಸಿಬ್ಬಂದಿ', perms: ['self.service'] },
  security: { kind: 'worker', en: 'Security', kn: 'ಭದ್ರತಾ ಸಿಬ್ಬಂದಿ', perms: ['self.service'] },
  student: { kind: 'learner', en: 'Student', kn: 'ವಿದ್ಯಾರ್ಥಿ', perms: ['learning.study'] },
  guardian: { kind: 'guardian', en: 'Parent / guardian', kn: 'ಪೋಷಕರು', perms: ['family.view'] },
}

export const ROLE_IDS = Object.keys(ROLES)

// Administrative workspaces need a second factor (MFA) before they open.
export const isPrivilegedRole = (role) => ROLES[role]?.kind === 'admin'

export const roleLabel = (role) => (ROLES[role] ? { en: ROLES[role].en, kn: ROLES[role].kn } : { en: role, kn: role })

export const SENSITIVE_PERMISSIONS = Object.entries(PERMISSIONS)
  .filter(([, p]) => p.sensitive)
  .map(([k]) => k)

// The legacy `role` the existing student/teacher screens understand.
export const legacyRoleFor = (kind) => ({ learner: 'student', teacher: 'teacher', guardian: 'guardian', admin: 'admin', worker: 'staff' })[kind] ?? 'none'
