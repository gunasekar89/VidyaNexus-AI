# VidyaNexus delivery tracker

The complete target scope from the school-administration master prompt, in dependency order, with the status of each item. A smaller release never removes scope: anything not built stays here as **Planned** until it ships.

Status: **Done** (working, tested) · **Partial** · **Planned** · **Blocked** (needs a decision from the school owner).
Phases: **F** Foundation · **C** Core school operations · **B** Broader administration · **A** Advanced intelligence.

Last updated: 2 November 2026.

## 1. Requirements matrix

Each row: what it is, who uses it, what it depends on, and when it is accepted.

### Foundation (F)

| ID | Capability | Actors | Depends on | Acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| F-01 | Repository audit and gap analysis | Product | – | [AUDIT.md](AUDIT.md) | Done |
| F-02 | Versioned migrations with FK check and legacy upgrade | Engineering | – | `test/migration.test.js` | Done |
| F-03 | Organisation model: group, legal entity, school, campus, department, academic year, financial year, term, grade, section | Owners, principals | F-02 | Tenant-aware composite keys; academic and financial years separate | Done |
| F-04 | Stable person identity, enrollments per year, employees, guardian links | Admin, admissions, HR | F-03 | One user row per person across years; history kept | Done |
| F-05 | Role catalogue (28 roles) and permission model with section scopes and explicit grants | All | F-04 | Permissions from verified memberships only | Done |
| F-06 | Three-card home page and per-card sign-in | Everyone | F-05 | Card is navigation only (test 1) | Done |
| F-07 | Sign-in by email, mobile, or student/employee ID + school code; no account enumeration | Everyone | F-05 | Same answer for every failure | Done |
| F-08 | Workspace switcher for multi-role people | Multi-role users | F-05 | Only own memberships (test 5) | Done |
| F-09 | 2-step sign-in (TOTP) for administration workspaces, replay protection | Admin roles | F-07 | Admin workspace never opens without a code | Done |
| F-10 | Invitation-based onboarding (staff, teachers with classes, parents with a child) | Principal, campus admin | F-05 | No open admin sign-up; scoped invitations | Done |
| F-11 | Password recovery (self-service request, admin-issued link) | Everyone, admins | F-07 | One-time, 1-hour links; cross-school accounts protected | Done (email delivery Blocked: provider) |
| F-12 | Append-only audit log incl. denied access and sensitive reads | Principal, auditor | F-05 | Triggers block edits; audit screen | Done |
| F-13 | Tenant isolation for existing learning data | All | F-03 | Test 2 (APIs) | Done for APIs; exports/files/AI/jobs Planned with those features |
| F-14 | Restricted records: pay, health, counseling, safeguarding with separate permissions | HR, payroll, nurse, counselor, DSL | F-05 | Test 4 | Done (data + access); workflows in B-phase |
| F-15 | Administration workspace: overview, people and roles, students, staff, setup, audit | Admin roles | F-05 | Browser-checked | Done |
| F-16 | Parent workspace: linked children only | Guardians | F-04 | Test 3 | Done |
| F-17 | Staff self-service (non-teaching, mobile) | Operational staff | F-04 | Reachable from both staff routes without teacher/admin rights | Done |
| F-18 | Group view: aggregate totals for the group's own schools | Owners, group managers | F-03 | No other group's schools | Done |
| F-19 | Institution SSO (Google Workspace / Microsoft Entra) | Schools that use it | F-07 | Optional per school | Planned |
| F-20 | Provider (SaaS) support access: separate admin, time-limited, school-approved, audited | Provider support | F-12 | No school data without an active grant | Planned |
| F-21 | Workflow service: states, approvals, tasks, versioned approvals | All modules | F-12 | Stale approvals rejected | Planned |
| F-22 | Outbox delivery worker with retries and dead-letter | Notifications | F-11 | Idempotent sends | Planned (table exists) |
| F-23 | Versioned policies, documents and file storage with access checks | All modules | F-21 | Files obey the same permissions | Planned |
| F-24 | Encrypt MFA secrets at rest; key rotation | Engineering | F-09 | Secrets not readable from a DB copy | Planned (production blocker) |
| F-25 | Account self-service: change mobile/email with verification; MFA reset by a second admin | Everyone | F-09 | Audited | Planned |

### Core school operations (C)

| ID | Capability (master prompt domain) | Actors | Depends on | Acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| C-01 | Admissions CRM: enquiry → application → documents → offer → enrollment (2) | Admissions, parents | F-04, F-21 | Criterion 6: no duplicate people, enrollments or fee demands | Planned |
| C-02 | Student lifecycle: section change, promotion, transfer, withdrawal, alumni, corrections with evidence (3) | Admin, principal | F-04 | History kept; criterion 20 | Planned |
| C-03 | Guardian management screens: verify, restrict pickup/communication, multiple guardians per child | Admissions, principal | F-04 | Criterion 3, 14 | Partial (invite-and-link done) |
| C-04 | Student attendance: period attendance, late/early, correction approval, guardian notification (5) | Teachers, office | F-21, F-22 | Classroom and bus attendance separate | Partial (daily attendance) |
| C-05 | Fee configuration: heads, instalments, concessions, scholarships, proration, approved changes (7) | Accountant, principal | F-03, F-21 | Integer paise; approvals | Blocked: school's fee policy |
| C-06 | Fee collection: gateway, cash/cheque, partial payments, receipts, refunds, reconciliation (8) | Cashier, accountant, parents | C-05 | Criteria 7–9 | Blocked: payment gateway choice |
| C-07 | Staff records, contracts, documents; leave and roster (12, 13) | HR, staff | F-04 | Criterion 11 | Partial (employee records) |
| C-08 | Basic payroll review: attendance inputs, variance flags, approval (14) | HR, payroll | C-07 | Criterion 12; statutory items from official sources | Blocked: statutory rules review |
| C-09 | Transport allocation and manifests (16) | Transport manager | F-04 | Criterion 13 | Planned |
| C-10 | Notifications: circulars, targeted messages, delivery status, quiet hours, EN/KN (26) | Office, teachers | F-22 | Opt-in honoured | Blocked: SMS/WhatsApp provider |
| C-11 | Management dashboards: attendance, admissions, collections, staff coverage (32) | Principal, owners | C-01..C-09 | Data freshness shown | Partial (overview, group totals) |
| C-12 | Academic administration: subject allocation, timetable with conflict checks, substitutions (4) | Coordinator | F-04 | Teacher absence flow in §5 | Planned |
| C-13 | Assessments: registration, moderation, approval, report cards, versioned publication (6) | Exam officer, teachers | F-21 | No unapproved results published | Partial (exams, marks) |
| C-14 | CSV/Excel import with validation, dedupe, trial run, rejected-row report (34) | Admin | F-04 | No duplicates on re-import | Planned |

### Broader administration (B)

| ID | Capability (domain) | Depends on | Status |
| --- | --- | --- | --- |
| B-01 | Accounting: chart of accounts, double-entry or Tally integration, period close (9) | C-06 | Planned (decision: in-app ledger vs Tally) |
| B-02 | Procurement and suppliers: requisition → PO → GRN → invoice match (10) | F-21 | Planned |
| B-03 | Recruitment and onboarding (11) | C-07 | Planned |
| B-04 | Outsourced workforce: agency contracts, rosters, duty proof, bill checks (15) | C-07 | Planned |
| B-05 | Transport live operations: GPS adapter, boarding events, missed pickup, incidents (17) | C-09 | Planned; GPS never proves custody |
| B-06 | Reception, visitors, gate, early exit, pickup verification (18) | C-03 | Planned |
| B-07 | Inventory and stores (19) | B-02 | Planned |
| B-08 | Assets, facilities and maintenance (20) | B-02 | Planned |
| B-09 | Library (21) | F-04 | Planned |
| B-10 | Meals and canteen (22), optional | C-05 | Planned |
| B-11 | Hostel / daycare / after-school (23), optional | C-05 | Planned |
| B-12 | Health and inclusion workflows (24) | F-14 | Partial (restricted notes) |
| B-13 | Safeguarding cases, drills, emergency escalation without AI (25) | F-14, F-22 | Partial (restricted notes) |
| B-14 | Helpdesk and grievances (27) | F-21 | Planned |
| B-15 | Activities, trips, sports, events (28) | C-05 | Planned |
| B-16 | Documents and certificates with serial numbers, verification (29) | F-23 | Planned |
| B-17 | Compliance calendar, evidence packs, renewals (30) | F-23 | Planned |
| B-18 | Scholarships, grants, community (31) | C-05 | Planned |
| B-19 | Year-end rollover: promotion, fee schedules, carry-forward, archiving (33) | C-02, C-06 | Planned |
| B-20 | Offline drafts for attendance and checklists with sync (§8) | C-04 | Planned |

### Advanced intelligence (A)

See §3 for the AI capability matrix. All AI work waits for the records it reads to exist.

## 2. Acceptance criteria coverage (master prompt §11)

| # | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| 1 | Card or URL cannot grant permissions | `test/access.test.js` › 1 | Done |
| 2 | No cross-tenant access | › 2 (APIs). Exports, files, AI retrieval, background jobs: none exist yet; each must add its own test | Done for current APIs |
| 3 | Parents see only linked children | › 3 | Done |
| 4 | Teachers can't read salaries or restricted notes | › 4 | Done |
| 5 | Multi-role switching only among verified memberships | › 5 | Done |
| 6 | Admission conversion without duplicates | – | Planned (C-01) |
| 7 | Partial payments, concessions, refunds reconcile | – | Planned (C-06) |
| 8 | Payment webhooks: duplicate/delayed/invalid/out-of-order safe | – | Planned (C-06) |
| 9 | Settlement and reconciliation separate from capture | – | Planned (C-06) |
| 10 | Posted entries balance; locked records need adjustments | – | Planned (B-01) |
| 11 | Leave affects payroll and coverage only via approved policy | – | Planned (C-07, C-12) |
| 12 | Reproducible, approved payroll | – | Planned (C-08) |
| 13 | Transport exceptions | – | Planned (C-09, B-05) |
| 14 | Pickup contact changes need verification; GPS never proves custody | – | Planned (C-03, B-06) |
| 15 | Procurement partial receipts and mismatches | – | Planned (B-02) |
| 16 | Safety escalation works when AI is down | – | Planned (B-13) |
| 17 | AI cites sources, refuses unauthorised requests, missing ≠ zero | – | Planned (§3) |
| 18 | AI action previews can't run stale/duplicate/unauthorised writes | – | Planned (F-21, §3) |
| 19 | EN/KN, mobile, accessibility, printing, offline | EN/KN and mobile browser-checked for new screens; printing and offline Planned | Partial |
| 20 | Year rollover, migration, backup restore, exits keep history | Migration: `test/migration.test.js`. Rollover, backups, exits Planned | Partial |

## 3. AI capability matrix

Rules for every row: deterministic code owns money, payroll and eligibility; AI drafts, explains, searches and flags. Retrieval is filtered by tenant, campus, role, relationship and field permissions **before** anything reaches the model. Every answer cites its records. Model provider per Guna's preference: the existing Azure OpenAI adapter (KodeKloud Azure playground) or Claude, chosen by `AI_PROVIDER`; the app keeps working when AI is off.

| Assistant | Method | Reads (after permission filter) | Output | Who approves | Status |
| --- | --- | --- | --- | --- | --- |
| Student tutor and study coach | LLM, curriculum-grounded | Own enrollment, homework, marks | Hints, plans, practice | Teacher review planned | Done (existing, now school/section scoped) |
| Principal / management | LLM summary over deterministic queries | Exceptions, KPIs the role may see | Briefs with source links | Principal | Planned |
| Admissions | OCR + LLM extraction | Application documents | Field suggestions, missing-document flags | Admissions officer | Planned |
| Finance | Deterministic ledger queries + LLM explanation; matching heuristics | Ledger, bank lines | Explanations, match suggestions, reminder drafts | Accountant | Planned |
| HR / payroll | Rules + LLM explanation | Policies, approved attendance | Variance flags, checklists | HR, payroll officer | Planned |
| Timetable | Constraint solver (not LLM) + LLM explanation | Allocations, rooms, workload | Options and their effects | Academic coordinator | Planned |
| Transport | Routing optimiser + timestamped events | Routes, manifests | Route options, mismatch alerts (deterministic) | Transport manager | Planned |
| Procurement / inventory | OCR + duplicate detection + statistical forecast | Invoices, POs, stock | Match results, reorder suggestions | Stores, accountant | Planned |
| Facilities / workforce | LLM to draft work orders | Issue reports, rosters | Draft tickets | Supervisor | Planned |
| Communication | LLM drafting and EN↔KN translation (existing translate adapter) | Approved templates, audience counts | Drafts with audience preview | Sender; sensitive/bulk need review | Partial (translation exists) |
| Compliance | Retrieval over approved policies | Policy versions, evidence | Gap lists, expiry flags (never certification) | Compliance owner | Planned |
| Parent / staff service | Retrieval limited to linked child / own records | Own data only | Answers or a helpdesk ticket | – | Planned |
| Analytics | NL → constrained metric catalogue (no raw SQL) | Permitted metrics | Numbers with definitions and dates | – | Planned |

Each assistant ships only with: an evaluation set, a usage budget per school, timeouts and fallbacks, prompt and model versions logged, and an action log. AI never approves refunds, releases payroll, changes bank details, posts discretionary journals, publishes results, disciplines anyone, or sends sensitive messages.

## 4. Assumptions (reversible)

- Classes 1–10, English and Kannada, Asia/Kolkata, Karnataka State board by default; all configurable per school.
- Academic year June–April; financial year April–March.
- SQLite remains the store for the demo and small single-school pilots. A multi-school production deployment should move to PostgreSQL (row-level security as a second isolation layer); the data model is written to port.
- Admission number doubles as the student login ID; employee number as the staff login ID.
- Demo data is synthetic. Demo admin accounts show their current 2-step code on the sign-in page; switch this off with `SHOW_DEMO_LOGINS=false`.

## 5. Production blockers

These must be resolved before real school data is loaded:

1. **Hosting and backups** (deployment decision): a persistent server with daily backups and a tested restore, HTTPS with `COOKIE_SECURE=true`, and separate demo / staging / production environments.
2. **Email/SMS provider** (money decision) for invitations, password resets and notices. Until then links are handed over by the admin.
3. **MFA secret encryption at rest** (F-24) and a second-admin MFA reset process (F-25).
4. **Data protection review**: DPDP Act/Rules applicability and dates, guardian consent for children's data, retention, breach handling. Must be verified from official sources by the school's adviser.
5. **Payment gateway and bank** (money decision) before any fee collection.
6. **Statutory payroll rules** verified from official sources before payroll calculations.
7. **Rate limiting** is in-memory per process; a multi-instance deployment needs a shared store.
