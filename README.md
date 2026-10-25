# VidyaNexus-AI
Smart Learning for Every School Day

A clickable demo of the VidyaNexus student dashboard, built from the design mockup. It runs entirely in the browser on mock data, so there is no backend to set up.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

## What's in the demo

- **Dashboard**: greeting banner, stat cards, today's timetable (the current class is marked LIVE), continue learning, AI study coach with a revision plan, upcoming tasks, weekly goal ring with tickable goals, and school announcements.
- **Smart Calendar**: week timetable grid and an October month view with events.
- **Subjects**: all subjects with progress, and a detail page per subject with chapters and homework.
- **AI Tutor**: chat with canned bilingual replies (algebra, practice questions, Force and Motion notes, constitution, revision plan). The coach shortcuts on the dashboard open it with a prompt filled in.
- **Homework**: filter by pending, due today or done, and tick items off. The sidebar badge and stat cards update.
- **Tests & Exams**: upcoming exams, recent results, and a 5-question algebra mock test.
- **Attendance**: monthly ring, calendar heatmap and monthly trend.
- **Announcements**: filter by important, events, holidays or library.
- **Progress**: subject progress, weekly study time and badges.
- **Profile**: student details, language switch, and a "Reset demo" button.

Across the app: the **EN / ಕನ್ನಡ** toggle translates the whole interface, **⌘K / Ctrl+K** opens search over pages, subjects, chapters, homework, tests and announcements, and the bell shows notifications you can mark as read. Ticked goals, homework and the chosen language are saved in the browser.

On phones the layout switches to the mobile design: compact header, greeting card, stat strip, swipeable continue-learning cards and a bottom tab bar (Home, Subjects, AI Tutor, Tasks, Profile). Pages not in the tab bar are listed on the Profile page.

## Stack

React 18, Vite 5, Tailwind CSS 3, React Router 6 and lucide-react icons. Mock data lives in `src/data/mock.js` and UI strings in `src/i18n.js`. The banner illustration, school illustration and avatar in `src/assets/` are cropped from the mockup.
