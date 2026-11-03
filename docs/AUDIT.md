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

| Domain (master prompt §4) | Status after release 1 (see section 4 for release 2) |
| --- | --- |
| 1 Group and school setup | Partial: structure, years, terms, grades, sections, departments, add-section; branding, affiliations, delegations and module switches missing |
| 3 Student lifecycle and family records | Partial: enrollments, guardians, admission numbers; transfers, promotion, withdrawal, alumni, corrections missing |
| 4 Academic administration | Partial: teacher section scopes; subject allocation, timetable generation, substitutions missing |
| 5 Student attendance | Partial: daily attendance per school; period attendance, corrections approval, guardian notifications missing |
| 6 Assessments | Partial: exams and marks per section; moderation, approval, report cards, versioned publication missing |
| 12 Employee lifecycle | Partial: employee records; contracts, appraisals, exits missing |
| 14 Payroll | Release 2: see section 4 |
| 24 Health and inclusion, 25 Safeguarding | Release 2: see section 4 |
| 32 Reporting | Partial: school overview and group totals |
| 34 Platform onboarding | Partial: invitations, demo seeding; imports, provisioning, offboarding missing |
| 2, 7–11, 13, 15–23, 26, 27 | Release 2: see section 4 |
| 28–31, 33 | Missing (planned; see tracker) |

### Unknowns that need the school or an official source

- Board per school (Karnataka State, CBSE, ICSE) and its assessment rules.
- Fee heads, instalment plans, concession policy and approval thresholds.
- Payment gateway and bank (affects contracts, fees and settlement files). **Money decision.**
- Payroll statutory items (PF, ESI, PT, TDS). The payroll engine takes these as school-configured rules; the seeded PF, ESI and PT rules are labelled examples, and the screen warns until a qualified person has checked them against current official sources. Nothing is paid from them until then.
- DPDP Act / Rules commencement and the school's consent process for children's data.
- Whether SATS, UDISE+ or APAAR exports are needed, and the officially permitted route for each.
- SMS / WhatsApp / email provider (costs money and needs sender registration). **Money decision.**
- Production hosting, backups and domain. **Deployment decision.** The current KodeKloud playgrounds are temporary and suitable only for demos.

## 4. Release 2: the office modules

Working code behind permissions, with 29 more acceptance tests in [`test/operations.test.js`](../test/operations.test.js), English and Kannada for every screen (checked by `npm run check:i18n`), and browser checks on desktop and phone. Migration `003-operations` adds the tables; demo data covers every module. It is a working pilot, not a production-ready system: see the tracker's production blockers.

| Domain (master prompt §4) | Status after release 2 |
| --- | --- |
| 2 Admissions | Implemented: enquiry → application → document checks → offer → acceptance → enrollment, with duplicate detection and stale-screen protection. Enrolling creates one student, a verified guardian link and the year's fees, once |
| 7 Fee setup | Implemented: fee heads, instalment plans per class, concessions and scholarships approved by a second person. Proration and late fees missing |
| 8 Fee collection | Implemented: counter payments (cash, cheque, UPI, card, net banking, transfer) with one receipt per payment even if submitted twice, oldest-dues-first allocation with credit, bounced cheques, reconciliation, refunds with approval, reminders, and a test-mode online gateway with signed webhooks and settlement. Live gateway Unknown (money decision) |
| 9 Accounting | Implemented: chart of accounts, balanced automatic postings from fees, payroll and purchases, manual journals approved by someone else, reversals instead of edits, month locks, trial balance |
| 10 Procurement | Implemented: requisition → approval → purchase order → goods receipt (partial deliveries allowed) → supplier invoice three-way match → approval → payment |
| 11 Recruitment | Missing |
| 13 Leave | Implemented: leave types and balances, apply, approve (never your own), cancel. Rosters missing |
| 14 Payroll | Implemented: configurable rules, loss of pay from approved unpaid leave, variance flags, the same inputs always giving the same run, approval by someone other than the preparer, payslips, bank file. Statutory rates Unknown (see above) |
| 15 Outsourced workforce | Missing |
| 16 Transport | Implemented: routes, stops, vehicles with document expiry warnings, crew, rider allocation with consent and seat checks, transport fees |
| 17 Live transport | Partial: trips, boarding marked by the crew, parents told, a trip cannot close with children unaccounted for, location pings with a stale flag. GPS device adapter missing |
| 18 Reception | Implemented: visitor passes and check-out; early pickup released only to an approved guardian unless an authorised person records an override |
| 19 Stores | Implemented: items, receipts, issues, adjustments, reorder warnings; stock never goes below zero |
| 20 Assets | Partial: asset register filled from goods receipts, with location and status. Maintenance missing |
| 21 Library | Implemented: catalogue and copies, issue and return with loan limits, overdue fines and waivers with a reason |
| 22 Meals, 23 Hostel | Missing (optional) |
| 24 Health | Partial: infirmary visits by the nurse; guardians told only when their link allows health information. Inclusion plans missing |
| 25 Safeguarding | Partial: any staff member can report; urgent concerns alert the safeguarding lead and principal at once without details and without AI; restricted case files with notes. Drills missing |
| 26 Communication | Partial: English and Kannada messages with audience preview, bulk messages approved by a second person, in-app inbox with read status. SMS and WhatsApp Unknown (money decision) |
| 27 Helpdesk | Implemented: requests with categories, priorities, response deadlines and comments; confidential grievances visible only to those allowed |
