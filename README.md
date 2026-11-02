# VidyaNexus-AI
Smart Learning for Every School Day

A bilingual (English / ಕನ್ನಡ) school platform: a learning app for students and teachers with a real AI tutor (Azure OpenAI or Claude), now growing into school administration. The home page offers three entry cards (Corporate / School Administration, Student / Parent, Teacher / Staff); what each person can do comes from the roles their school gave them, checked on the server on every request. Students see their timetable, homework, goals, tests, attendance and progress; teachers set homework, post announcements, schedule exams, enter marks, take attendance and add students. Everything is saved in a database.

## Run it with Docker (recommended)

```bash
cp .env.example .env          # then fill in the Azure OpenAI or Claude settings in .env
docker compose up -d --build  # http://localhost
```

On a fresh Ubuntu machine, `bash deploy/setup.sh` installs Docker, asks for the AI settings and starts everything. See [deploy/KODEKLOUD.md](deploy/KODEKLOUD.md) for step-by-step KodeKloud (Docker playground or AWS EC2) instructions.

Demo logins (shown on each sign-in page until their passwords are changed; all data is synthetic):

| Card | Who | Sign in with | Password |
| --- | --- | --- | --- |
| Student / Parent | Student Jason | `jason@vidyanexus.school` (or ID `VPS-07A-18` + school code `VPS-BLR`) | `jason123` |
| Student / Parent | Parent Suresh K. (Jason's father) | `suresh.k@vidyanexus.school` or mobile `98450 12345` | `parent123` |
| Teacher / Staff | Teacher Dola Ramesh (Class 7A) | `dola.ramesh@vidyanexus.school` | `teacher123` |
| Teacher / Staff | Driver Manjunath B. (staff self-service) | employee ID `EMP-0201` + school code `VPS-BLR` | `staff1234` |
| Administration | Principal Dr. Shalini Rao | `principal@vidyanexus.school` | `admin1234` + 2-step code |
| Administration | Trustee Ravi Shankar (school group) | `trustee@vidyanexus.school` | `admin1234` + 2-step code |
| Administration | HR officer Farah Khan (sees pay) | `hr@vidyanexus.school` | `admin1234` + 2-step code |
| Admin + parent | Kiran M., accountant and Rahul's father (two roles) | `kiran.m@vidyanexus.school` | `admin1234` (+ code for the accountant role) |

Administration roles need a 2-step code from an authenticator app. For the demo accounts the sign-in page shows the current code, because a demo has no phone to scan with. Three more students (Rahul, Meera, Arjun) use `student123`. A second, separate school (Sahyadri Public School, Mysuru: `asha.k@sahyadri.school` / `teacher123`, `nikhil@sahyadri.school` / `student123`) exists to show that schools can't see each other's data.

Upgrading from an earlier version keeps your data: on start-up the database is migrated and existing students, teachers and records are attached to the demo school.

## Run it for development

Needs Node.js 22.13 or newer.

```bash
npm install
ANTHROPIC_API_KEY=sk-ant-... npm run dev:server   # API on http://localhost:3000
npm run dev                                       # web app on http://localhost:5173 (proxies /api)
```

`npm run build && npm start` serves the built app and API together on port 3000.

`npm test` runs the access-control and migration tests (Node's built-in test runner, no extra tools).

## AI settings

The AI Tutor, AI revision plans, AI practice tests and automatic English ↔ Kannada translation of teacher posts can use either provider (in `.env` for Docker, or the environment):

- **Azure OpenAI**: set `AZURE_OPENAI_ENDPOINT` (the resource endpoint or the deployment's full Target URI), `AZURE_OPENAI_API_KEY` and, unless it's in the Target URI, `AZURE_OPENAI_DEPLOYMENT`. Needs a chat model with structured outputs, such as gpt-4o-mini. [deploy/KODEKLOUD.md](deploy/KODEKLOUD.md) shows how to get these from the KodeKloud Azure playground.
- **Claude**: set `ANTHROPIC_API_KEY`. The model defaults to `claude-opus-5-5` and can be changed with `ANTHROPIC_MODEL`.

If both are set, `AI_PROVIDER=azure` or `AI_PROVIDER=anthropic` picks one (Claude by default). Keys stay on the server and are never sent to browsers. Without any key the app still runs: the tutor gives offline sample answers and the AI buttons explain that AI is off. `AI_REQUESTS_PER_10_MIN` (default 40) caps AI requests per student to protect your budget.

## Features

**Entry and access**
- Home page with three entry cards; sign-in by email, mobile number, or student/employee ID plus school code.
- One account can hold several roles (for example parent and accountant) with a workspace switcher.
- 2-step sign-in for administration roles, invitation-only onboarding, password reset links, and an audit log.

**School administration**
- Overview (enrolment, classes, staff, linked parents, today's attendance), people and roles with invitations, student register, staff directory (pay visible only to HR and payroll), school setup (campuses, academic and financial years, terms, departments, classes), audit log, and a group view for school owners.

**Parents**
- Each linked child's attendance, homework, upcoming exams, marks, awards and school notices.

**Non-teaching staff**
- Phone-friendly self-service: own details, own pay, school notices.

**Students**
- **Dashboard**: greeting banner, today's classes, homework due, next exam and this month's attendance, today's timetable with a LIVE marker, continue learning, AI study coach plan, upcoming tasks, weekly goals and announcements.
- **AI Tutor**: streaming AI chat that knows the student's chapters, exams, homework and marks, answers in English or Kannada, and keeps the conversation.
- **AI Study Coach**: a revision plan generated for the next exam; "Start plan" adds its steps to the weekly goals.
- **Subjects**: chapters with progress; mark chapters complete or ask the tutor to explain the current one.
- **Homework**: tick off homework set by teachers; due dates show as Today / Tomorrow / date.
- **Tests & Exams**: upcoming exams, marks entered by teachers, the built-in algebra mock test, AI-generated practice tests per subject, and saved scores.
- **Attendance**: month calendar with history and a monthly trend.
- **Calendar**: weekly timetable and a month view of homework, exams and events.
- **Progress**: subject progress, study time (counted while the app is open), day streak and badges earned from real activity.
- **Profile**: details, language and password change.

**Teachers** (Teacher Desk)
- Set homework and see how many students finished it.
- Post announcements (category, important flag, optional event date).
- Schedule exams and enter marks for the whole class at once.
- Take attendance for any day.
- Add student accounts.

Teachers can type in English, Kannada or both; a blank side is filled in by AI translation.

Across the app the **EN / ಕನ್ನಡ** toggle translates the whole interface (and is remembered per user), **⌘K / Ctrl+K** searches pages, subjects, chapters, homework, tests and announcements, and the bell shows homework, announcement and coach notifications. On phones the layout switches to the mobile design with a bottom tab bar.

## Plans and documentation

- [docs/AUDIT.md](docs/AUDIT.md): what existed, what changed, and the gap analysis.
- [docs/TRACKER.md](docs/TRACKER.md): the full target scope (all 34 administration domains), acceptance criteria coverage, the AI capability matrix and production blockers.
- [docs/ACCESS.md](docs/ACCESS.md): sign-in journeys, the role and permission matrix, the data model and the API.

## Stack

- **Web**: React 18, Vite 5, Tailwind CSS 3, React Router 6, lucide-react. UI strings in `src/i18n.js`.
- **API**: Node.js + Express in `server/`, SQLite through Node's built-in `node:sqlite` (no database server to run), versioned migrations in `server/migrations/`, cookie sessions with scrypt-hashed passwords, TOTP 2-step sign-in.
- **Access control**: roles and permissions in `shared/roles.js`, enforced per request in `server/access.js`; identity, admin, parent and staff routes in `server/identity.js`.
- **AI**: `@anthropic-ai/sdk` in `server/ai.js` (streaming chat, structured JSON output for plans, tests and translations).
- **Shared catalogue**: subjects, chapters, timetable, mock test and badges in `shared/catalog.js`.
- **Deploy**: `Dockerfile` + `docker-compose.yml`; data lives in the `vidyanexus-data` volume.

The banner illustration, school illustration and avatar in `src/assets/` are cropped from the mockup.
