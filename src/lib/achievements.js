import { currentMonthPct } from './attendance'
import { addDays, isoDate } from './dates'

// Consecutive days with study time, counting back from today (or yesterday if today has none yet).
export function studyStreak(studyLog) {
  const byDate = Object.fromEntries(studyLog.map((d) => [d.date, d.minutes]))
  let day = isoDate()
  if (!byDate[day]) day = addDays(day, -1)
  let streak = 0
  while (byDate[day] > 0) {
    streak++
    day = addDays(day, -1)
  }
  return streak
}

// Which of the catalogue badges the student has earned, by badge id.
export function earnedBadges(data) {
  return {
    streak: studyStreak(data.studyLog) >= 7,
    algebra: data.attempts.some((a) => a.score >= 4),
    bookworm: (data.chapters.english ?? []).length >= 3,
    ontime: (currentMonthPct(data.attendance) ?? 0) >= 90,
  }
}
