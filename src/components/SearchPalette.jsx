import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Search } from 'lucide-react'
import { useApp } from '../AppContext'
import { announcements, exams, homework, subjectById, subjects } from '../data/mock'
import { navItems } from './nav'

// ⌘K command palette that searches pages, subjects, chapters, homework, tests and announcements.
export default function SearchPalette({ open, onClose }) {
  const { t, tr } = useApp()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const items = useMemo(() => {
    const all = [
      ...navItems.map((n) => ({ group: t('pages'), label: t(n.key), hint: t('goTo'), to: n.to })),
      ...subjects.map((s) => ({ group: t('subjects'), label: tr(s.name), hint: tr(s.topic), to: `/subjects/${s.id}` })),
      ...subjects.flatMap((s) =>
        s.chapters.map((c) => ({ group: t('chapters'), label: tr(c), hint: tr(s.name), to: `/subjects/${s.id}` })),
      ),
      ...homework.map((h) => ({ group: t('homework'), label: tr(h.title), hint: tr(h.detail), to: '/homework' })),
      ...exams.map((e) => ({
        group: t('testsExams'),
        label: `${tr(subjectById[e.subject].name)} – ${tr(e.name)}`,
        hint: tr(e.date),
        to: '/tests',
      })),
      ...announcements.map((a) => ({ group: t('announcements'), label: tr(a.title), hint: tr(a.time), to: '/announcements' })),
    ]
    const q = query.trim().toLowerCase()
    if (!q) return all.slice(0, 9)
    return all.filter((i) => `${i.label} ${i.hint}`.toLowerCase().includes(q)).slice(0, 12)
  }, [query, t, tr])

  if (!open) return null

  const go = (item) => {
    navigate(item.to)
    onClose()
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, items.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    }
    if (e.key === 'Enter' && items[active]) go(items[active])
  }

  let lastGroup = null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-[12vh] backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <Search size={20} className="text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            placeholder={t('searchPlaceholder')}
            className="h-14 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-slate-400"
          />
          <kbd className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">Esc</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {items.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">{t('noResults')}</p>}
          {items.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null
            lastGroup = item.group
            return (
              <div key={`${item.group}-${item.label}-${i}`}>
                {header && <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{header}</div>}
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(item)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${active === i ? 'bg-brand-50' : ''}`}
                >
                  <span className="flex-1">
                    <span className="block text-sm font-medium text-ink">{item.label}</span>
                    <span className="block text-xs text-muted">{item.hint}</span>
                  </span>
                  {active === i && <ArrowRight size={16} className="text-brand-600" />}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
