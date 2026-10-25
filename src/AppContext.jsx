import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { subjects as catalogSubjects, weekSchedule } from '../shared/catalog'
import { api } from './api'
import { strings } from './i18n'
import { addDays, dateLabel, daysBetween, isoDate, relativeTime, weekdayKey } from './lib/dates'

const AppContext = createContext(null)

function readLang() {
  try {
    return localStorage.getItem('vn.lang') === 'kn' ? 'kn' : 'en'
  } catch {
    return 'en'
  }
}

// Turns raw API data into the shapes the screens use (labels in both languages).
function shape(raw) {
  const today = isoDate()
  const tomorrow = addDays(today, 1)

  const homework = raw.homework.map((h) => {
    const due = h.done ? 'done' : h.dueDate === today ? 'today' : h.dueDate === tomorrow ? 'tomorrow' : h.dueDate < today ? 'overdue' : 'later'
    const dueLabel =
      h.dueDate === today
        ? { en: strings.en.today, kn: strings.kn.today }
        : h.dueDate === tomorrow
          ? { en: strings.en.tomorrow, kn: strings.kn.tomorrow }
          : dateLabel(h.dueDate)
    return { ...h, due, dueLabel }
  })

  const subjects = catalogSubjects.map((s) => {
    const done = new Set(raw.chapters[s.id] ?? [])
    const currentIndex = s.chapters.findIndex((_, i) => !done.has(i))
    const chapters = s.chapters.map((c, i) => ({ ...c, index: i, done: done.has(i), current: i === currentIndex }))
    const progress = Math.round((done.size / s.chapters.length) * 100)
    const current = chapters[currentIndex]
    return { ...s, chapters, progress, topic: current ? { en: current.en, kn: current.kn } : s.topic }
  })

  const exams = raw.exams.map((e) => ({
    ...e,
    inDays: daysBetween(today, e.date),
    dateLabel: dateLabel(e.date, { weekday: 'short', day: 'numeric', month: 'short' }),
  }))

  const withTime = (item, at) => ({ ...item, time: relativeTime(at) })

  return {
    ...raw,
    homework,
    subjects,
    subjectById: Object.fromEntries(subjects.map((s) => [s.id, s])),
    exams,
    announcements: raw.announcements.map((a) => withTime(a, a.createdAt)),
    notifications: raw.notifications.map((n) => withTime(n, n.at)),
  }
}

export function AppProvider({ children }) {
  const [lang, setLangState] = useState(readLang)
  const [auth, setAuth] = useState({ status: 'loading', user: null, aiEnabled: false })
  const [raw, setRaw] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [toast, setToast] = useState(null)

  const t = useCallback((key) => strings[lang][key] ?? strings.en[key] ?? key, [lang])
  // Pick the right language from a { en, kn } object.
  const tr = useCallback((obj) => (obj ? obj[lang] || obj.en || '' : ''), [lang])
  // Translated message for an API error code.
  const errorText = useCallback(
    (err) => {
      const key = `err.${err?.code ?? 'server.error'}`
      return strings[lang][key] ?? strings.en[key] ?? strings[lang]['err.server.error']
    },
    [lang],
  )

  useEffect(() => {
    document.documentElement.lang = lang === 'kn' ? 'kn' : 'en'
    try {
      localStorage.setItem('vn.lang', lang)
    } catch {
      // Storage can be unavailable (private mode); the choice still applies for this visit.
    }
  }, [lang])

  const showToast = useCallback((message) => {
    setToast(message)
    window.clearTimeout(showToast.timer)
    showToast.timer = window.setTimeout(() => setToast(null), 2600)
  }, [])

  const refresh = useCallback(async () => {
    try {
      setRaw(await api('/student/overview'))
      setLoadError(null)
    } catch (err) {
      if (err.status === 401) setAuth({ status: 'ready', user: null, aiEnabled: false })
      else setLoadError(err)
    }
  }, [])

  const signedIn = useCallback(
    ({ user, aiEnabled }) => {
      setAuth({ status: 'ready', user, aiEnabled })
      if (user.lang) setLangState(user.lang)
      if (user.role === 'student') refresh()
    },
    [refresh],
  )

  useEffect(() => {
    api('/me')
      .then(signedIn)
      .catch(() => setAuth({ status: 'ready', user: null, aiEnabled: false }))
  }, [signedIn])

  const login = async (email, password) => {
    const res = await api('/auth/login', { method: 'POST', body: { email, password } })
    // Keep the language picked on the login screen.
    if (res.user.lang !== lang) {
      api('/me', { method: 'PATCH', body: { lang } }).catch(() => {})
      res.user.lang = lang
    }
    signedIn(res)
  }

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {})
    setRaw(null)
    setAuth({ status: 'ready', user: null, aiEnabled: false })
  }

  const setLang = (next) => {
    setLangState(next)
    if (auth.user) api('/me', { method: 'PATCH', body: { lang: next } }).catch(() => {})
  }

  const updateUser = (user) => setAuth((a) => ({ ...a, user }))

  // Count study time: one ping per minute while a student has the app open and visible.
  const isStudent = auth.user?.role === 'student'
  useEffect(() => {
    if (!isStudent) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') api('/study/ping', { method: 'POST' }).catch(() => {})
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [isStudent])

  const data = useMemo(() => (raw ? shape(raw) : null), [raw])

  // Run an API call, then reload the student's data. Shows a toast on failure.
  const mutate = useCallback(
    async (path, options, optimistic) => {
      if (optimistic) setRaw((r) => (r ? optimistic(r) : r))
      try {
        const res = await api(path, options)
        await refresh()
        return res
      } catch (err) {
        showToast(errorText(err))
        await refresh()
        throw err
      }
    },
    [refresh, showToast, errorText],
  )

  const toggleHomework = (id) =>
    mutate(`/homework/${id}/toggle`, { method: 'POST' }, (r) => ({
      ...r,
      homework: r.homework.map((h) => (h.id === id ? { ...h, done: !h.done } : h)),
    })).catch(() => {})

  const toggleGoal = (id) => {
    const goal = raw?.goals.find((g) => g.id === id)
    if (!goal) return
    mutate(`/goals/${id}`, { method: 'PATCH', body: { done: !goal.done } }, (r) => ({
      ...r,
      goals: r.goals.map((g) => (g.id === id ? { ...g, done: !g.done } : g)),
    })).catch(() => {})
  }

  const addGoal = (label) => mutate('/goals', { method: 'POST', body: { label, lang } })
  const deleteGoal = (id) =>
    mutate(`/goals/${id}`, { method: 'DELETE' }, (r) => ({ ...r, goals: r.goals.filter((g) => g.id !== id) })).catch(() => {})

  const setChapterDone = (subject, index, done) =>
    mutate(`/chapters/${subject}/${index}`, { method: done ? 'POST' : 'DELETE' }, (r) => {
      const list = new Set(r.chapters[subject] ?? [])
      if (done) list.add(index)
      else list.delete(index)
      return { ...r, chapters: { ...r.chapters, [subject]: [...list] } }
    })

  const markNotificationsRead = (keys) =>
    mutate('/notifications/read', { method: 'POST', body: { keys } }, (r) => ({
      ...r,
      notifications: r.notifications.map((n) => (keys.includes(n.key) ? { ...n, read: true } : n)),
    })).catch(() => {})

  const value = {
    lang,
    setLang,
    t,
    tr,
    errorText,
    user: auth.user,
    authStatus: auth.status,
    aiEnabled: auth.aiEnabled,
    login,
    logout,
    updateUser,
    data,
    loadError,
    refresh,
    mutate,
    toggleHomework,
    toggleGoal,
    addGoal,
    deleteGoal,
    setChapterDone,
    markNotificationRead: (key) => markNotificationsRead([key]),
    markAllNotificationsRead: () => markNotificationsRead((raw?.notifications ?? []).filter((n) => !n.read).map((n) => n.key)),
    toast,
    showToast,
    // Shortcuts used across the student screens.
    homework: data?.homework ?? [],
    goals: data?.goals ?? [],
    notifications: data?.notifications ?? [],
    subjects: data?.subjects ?? [],
    subjectById: data?.subjectById ?? {},
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export const useApp = () => useContext(AppContext)

export function greetingKey(date = new Date()) {
  const h = date.getHours()
  if (h < 12) return 'goodMorning'
  if (h < 17) return 'goodAfternoon'
  return 'goodEvening'
}

// Today's classes from the weekly timetable (empty on Sundays).
export function todaysClasses(date = new Date()) {
  const key = weekdayKey(date)
  return key ? weekSchedule[key] : []
}
