# VidyaNexus: existing-app audit and gap analysis

Audit date: 2 November 2026. Baseline: `main` at `f09696e` (PR #3, awards). This file records what the app did before the school-administration expansion, what the first increment changed, and what remains. The full target scope and its status live in [TRACKER.md](TRACKER.md).

## 1. What existed before this increment

| Area | Evidence in code | Status |
| --- | --- | --- |
| Stack | React 18 + Vite 5 + Tailwind 3 (`src/`), Express 4 + SQLite via `node:sqlite` (`server/`), Docker single container | Implemented |
| Sign-in | Email + password, scrypt hashes, 30-day cookie sessions, in-memory rate limit (`server/auth.js`) | Implemented |
| Roles | One `users.role` column, only `student` or `teacher` (CHECK constraint) | Partial |
| Tenancy | None. One implicit school; teachers saw every student in the database | Missing |
| Student app | Dashboard, timetable, subjects/chapters, homework, goals, tests and AI practice tests, attendance, announcements, progress, awards, AI tutor, AI study coach | Implemented |
| Teacher desk | Homework, announcements, exams, marks, attendance, awards, add student | Implemented (no class scoping) |
| Parents | Only a free-text `guardian` name on the student row | Missing |
| Administration, finance, HR, transport, operations | None | Missing |
| AI | Azure OpenAI or Claude for tutor, plans, practice tests, translation; offline fallback | Implemented (student learning only) |
| Localisation | Every UI string in English and Kannada (`src/i18n.js`) | Implemented |
| Audit trail | None | Missing |
| Schema changes | `CREATE TABLE IF NOT EXISTS` at start-up, no migrations | Missing |
| Tests | None | Missing |
| Deployment | `Dockerfile`, `docker-compose.yml`, `deploy/setup.sh` for KodeKloud playgrounds | Implemented (demo only) |

### Security findings in the baseline (fixed in this increment)

1. **Any teacher could act on any student.** `/teacher/*` listed every `role = 'student'` row and accepted marks, awards and attendance for any student id. Now limited to the teacher's assigned sections in their own school.
2. **Deletes were unscoped.** `DELETE /teacher/homework/:id` (and announcements, exams, results, awards) deleted by id alone. Now they only match rows in the teacher's school and sections, and are audited.
3. **Students could toggle any homework id.** Now only homework for their own school and section.
4. **No record of sensitive actions.** Now an append-only `audit_events` table (database triggers block updates and deletes).

## 2. What this increment adds

All of it is working code with automated tests; nothing below is a mock-up.

- **Migrations** (`server/migrate.js`, `server/migrations/`): versioned, each in a transaction, foreign keys checked before commit. `001-baseline` is the old schema; `002-identity-tenancy` rebuilds `users` and adds the organisation model. Existing databases are upgraded in place and their students, teacher and records are attached to the demo school (`backfillLegacy`). A test upgrades a v0.2 database and checks nothing is lost.
- **Organisation model**: school group → legal entity → school → campus, departments, academic years (June–April) kept separate from financial years (April–March), terms, grades 1–10, sections. Tenant-aware composite foreign keys stop a section, enrollment or term pointing at another school's rows.
- **People**: stable `users` identity; per-year `enrollments`; `employees` with teaching / non-teaching / contractor type; restricted `employee_compensation` (paise, effective-dated); `guardian_links` with relationship, verification and per-link permissions (pickup, fees, health, communication); restricted `student_notes` (health, counseling, safeguarding).
- **Memberships and permissions** (`shared/roles.js`, `server/access.js`): 28 configurable roles, each mapped to permissions and a workspace kind. Permissions are recomputed from the active membership on every request. Sensitive permissions (pay, health, counseling, safeguarding) come only from roles made for that work or from an explicit grant with a reason.
- **Three-card home page and sign-in** (`src/pages/Home.jsx`, `Login.jsx`): Corporate / School Administration, Student / Parent, Teacher / Staff. Sign-in by email, Indian mobile number, or student/employee ID plus school code. Identical answers and timing for unknown accounts, wrong passwords and wrong school codes. The chosen card only decides which workspace opens first.
- **Workspace switcher**: people with several memberships choose and switch between them; only their own active memberships are offered or accepted.
- **2-step sign-in (TOTP)** for every administration workspace, with QR enrolment, one-step clock drift, and replay protection.
- **Invitation-based onboarding** for staff, teachers (with class scopes) and parents (linked to a named child). No open registration. Roles that can invite others can only be granted by someone who manages members.
- **Password recovery**: self-service request (always the same answer) queued in an `outbox`, and admin-issued one-hour reset links. An admin cannot reset an account that also belongs to another school, or an MFA-protected admin account.
- **Workspaces**: school administration (overview, people and roles, students, staff, school setup, audit log, group view), parent view of linked children, and phone-friendly staff self-service (own details and own pay).

## 3. Gap analysis

| Status | Meaning |
| --- | --- |
| Implemented | Working code with tests or browser checks in this repo |
| Partial | Data model or part of the workflow exists; the rest is listed in the tracker |
| Missing | Not built |
| Unknown | Needs a decision or information from the school or an official source |

| Domain (master prompt §4) | Status after this increment |
| --- | --- |
| 1 Group and school setup | Partial: structure, years, terms, grades, sections, departments, add-section; branding, affiliations, delegations and module switches missing |
| 3 Student lifecycle and family records | Partial: enrollments, guardians, admission numbers; transfers, promotion, withdrawal, alumni, corrections missing |
| 4 Academic administration | Partial: teacher section scopes; subject allocation, timetable generation, substitutions missing |
| 5 Student attendance | Partial: daily attendance per school; period attendance, corrections approval, guardian notifications missing |
| 6 Assessments | Partial: exams and marks per section; moderation, approval, report cards, versioned publication missing |
| 12 Employee lifecycle | Partial: employee records; contracts, appraisals, exits missing |
| 14 Payroll | Partial: restricted pay records only; payroll runs missing |
| 24 Health and inclusion, 25 Safeguarding | Partial: restricted notes with separate permissions; workflows missing |
| 32 Reporting | Partial: school overview and group totals |
| 34 Platform onboarding | Partial: invitations, demo seeding; imports, provisioning, offboarding missing |
| 2, 7–11, 13, 15–23, 26–31, 33 | Missing (planned; see tracker) |

### Unknowns that need the school or an official source

- Board per school (Karnataka State, CBSE, ICSE) and its assessment rules.
- Fee heads, instalment plans, concession policy and approval thresholds.
- Payment gateway and bank (affects contracts, fees and settlement files). **Money decision.**
- Payroll statutory items (PF, ESI, PT, TDS) must be checked against current official sources before any calculation is built.
- DPDP Act / Rules commencement and the school's consent process for children's data.
- Whether SATS, UDISE+ or APAAR exports are needed, and the officially permitted route for each.
- SMS / WhatsApp / email provider (costs money and needs sender registration). **Money decision.**
- Production hosting, backups and domain. **Deployment decision.** The current KodeKloud playgrounds are temporary and suitable only for demos.
