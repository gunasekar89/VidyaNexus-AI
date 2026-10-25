import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { homework as initialHomework, notifications as initialNotifications, weeklyGoals as initialGoals } from './data/mock'
import { strings } from './i18n'

const AppContext = createContext(null)

function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key)
      return saved ? JSON.parse(saved) : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Storage can be unavailable (private mode); the demo still works in memory.
    }
  }, [key, value])
  return [value, setValue]
}

export function AppProvider({ children }) {
  const [lang, setLang] = usePersistentState('vn.lang', 'en')
  const [homework, setHomework] = usePersistentState('vn.homework', initialHomework)
  const [goals, setGoals] = usePersistentState('vn.goals', initialGoals)
  const [readNotifications, setReadNotifications] = usePersistentState('vn.readNotifications', [])
  const [toast, setToast] = useState(null)

  useEffect(() => {
    document.documentElement.lang = lang === 'kn' ? 'kn' : 'en'
  }, [lang])

  const t = useCallback((key) => strings[lang][key] ?? strings.en[key] ?? key, [lang])
  // Pick the right language from a { en, kn } object.
  const tr = useCallback((obj) => (obj ? obj[lang] ?? obj.en : ''), [lang])

  const showToast = useCallback((message) => {
    setToast(message)
    window.clearTimeout(showToast.timer)
    showToast.timer = window.setTimeout(() => setToast(null), 2600)
  }, [])

  const toggleHomework = (id) =>
    setHomework((list) => list.map((h) => (h.id === id ? { ...h, done: !h.done } : h)))
  const toggleGoal = (id) => setGoals((list) => list.map((g) => (g.id === id ? { ...g, done: !g.done } : g)))

  const notifications = initialNotifications.map((n) => ({ ...n, read: readNotifications.includes(n.id) }))
  const markNotificationRead = (id) => setReadNotifications((ids) => (ids.includes(id) ? ids : [...ids, id]))
  const markAllNotificationsRead = () => setReadNotifications(initialNotifications.map((n) => n.id))

  const resetDemo = () => {
    setHomework(initialHomework)
    setGoals(initialGoals)
    setReadNotifications([])
  }

  const value = useMemo(
    () => ({
      lang,
      setLang,
      t,
      tr,
      homework,
      toggleHomework,
      goals,
      toggleGoal,
      notifications,
      markNotificationRead,
      markAllNotificationsRead,
      toast,
      showToast,
      resetDemo,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang, t, tr, homework, goals, readNotifications, toast],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export const useApp = () => useContext(AppContext)

export function greetingKey(date = new Date()) {
  const h = date.getHours()
  if (h < 12) return 'goodMorning'
  if (h < 17) return 'goodAfternoon'
  return 'goodEvening'
}
