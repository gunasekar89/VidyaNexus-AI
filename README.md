# VidyaNexus-AI
Smart Learning for Every School Day

A bilingual (English / ಕನ್ನಡ) school app for students and teachers, with a real AI tutor powered by Claude. Students see their timetable, homework, goals, tests, attendance and progress; teachers set homework, post announcements, schedule exams, enter marks, take attendance and add students. Everything is saved in a database.

## Run it with Docker (recommended)

```bash
cp .env.example .env          # then put your ANTHROPIC_API_KEY in .env
docker compose up -d --build  # http://localhost
```

On a fresh Ubuntu machine, `bash deploy/setup.sh` installs Docker, asks for the key and starts everything. See [deploy/KODEKLOUD.md](deploy/KODEKLOUD.md) for step-by-step KodeKloud (Docker playground or AWS EC2) instructions.

Demo logins (shown on the login page until their passwords are changed):

| Role | Email | Password |
| --- | --- | --- |
| Student | `ananya.s@vidyanexus.school` | `ananya123` |
| Teacher | `lakshmi.r@vidyanexus.school` | `teacher123` |

Three more students (Rahul, Meera, Arjun) use `student123`.

## Run it for development

Needs Node.js 22.13 or newer.

```bash
npm install
ANTHROPIC_API_KEY=sk-ant-... npm run dev:server   # API on http://localhost:3000
npm run dev                                       # web app on http://localhost:5173 (proxies /api)
```

`npm run build && npm start` serves the built app and API together on port 3000.

## The Claude API key

The AI Tutor, AI revision plans, AI practice tests and automatic English ↔ Kannada translation of teacher posts use the Claude API. Set `ANTHROPIC_API_KEY` (in `.env` for Docker, or the environment). The key stays on the server and is never sent to browsers. Without a key the app still runs: the tutor gives offline sample answers and the AI buttons explain that AI is off.

The model defaults to `claude-opus-5-5` and can be changed with `ANTHROPIC_MODEL`. `AI_REQUESTS_PER_10_MIN` (default 40) caps AI requests per student to protect your budget.

## Features

**Students**
- **Dashboard**: greeting banner, today's classes, homework due, next exam and this month's attendance, today's timetable with a LIVE marker, continue learning, AI study coach plan, upcoming tasks, weekly goals and announcements.
- **AI Tutor**: streaming chat with Claude that knows the student's chapters, exams, homework and marks, answers in English or Kannada, and keeps the conversation.
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

Teachers can type in English, Kannada or both; a blank side is filled in by Claude's translation.

Across the app the **EN / ಕನ್ನಡ** toggle translates the whole interface (and is remembered per user), **⌘K / Ctrl+K** searches pages, subjects, chapters, homework, tests and announcements, and the bell shows homework, announcement and coach notifications. On phones the layout switches to the mobile design with a bottom tab bar.

## Stack

- **Web**: React 18, Vite 5, Tailwind CSS 3, React Router 6, lucide-react. UI strings in `src/i18n.js`.
- **API**: Node.js + Express in `server/`, SQLite through Node's built-in `node:sqlite` (no database server to run), cookie sessions with scrypt-hashed passwords.
- **AI**: `@anthropic-ai/sdk` in `server/ai.js` (streaming chat, structured JSON output for plans, tests and translations).
- **Shared catalogue**: subjects, chapters, timetable, mock test and badges in `shared/catalog.js`.
- **Deploy**: `Dockerfile` + `docker-compose.yml`; data lives in the `vidyanexus-data` volume.

The banner illustration, school illustration and avatar in `src/assets/` are cropped from the mockup.
