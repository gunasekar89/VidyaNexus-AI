import { Link } from 'react-router-dom'
import { BookOpen, Cpu, FlaskConical, Globe2, X } from 'lucide-react'
import { useEffect } from 'react'
import { useApp } from '../AppContext'

export function Card({ className = '', children, ...props }) {
  return (
    <div className={`rounded-2xl border border-slate-100 bg-white shadow-card ${className}`} {...props}>
      {children}
    </div>
  )
}

export function SectionHeader({ icon, title, subtitle, to, linkLabel, onLink }) {
  const { t } = useApp()
  const label = linkLabel ?? t('viewAll')
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        {icon}
        <div>
          <h2 className="text-[17px] font-semibold leading-tight text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {to && (
        <Link to={to} className="shrink-0 pt-0.5 text-[13px] font-medium text-brand-600 hover:underline">
          {label}
        </Link>
      )}
      {onLink && (
        <button onClick={onLink} className="shrink-0 pt-0.5 text-[13px] font-medium text-brand-600 hover:underline">
          {label}
        </button>
      )}
    </div>
  )
}

export function ProgressBar({ value, className = '' }) {
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-slate-100 ${className}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500"
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

const iconColors = {
  orange: 'from-orange-400 to-orange-500',
  blue: 'from-sky-400 to-blue-500',
  green: 'from-emerald-500 to-green-600',
  amber: 'from-orange-400 to-amber-500',
  pink: 'from-pink-400 to-rose-500',
  violet: 'from-violet-500 to-indigo-600',
}

export function SubjectIcon({ subject, size = 'md' }) {
  const box = size === 'sm' ? 'h-8 w-8 rounded-lg' : size === 'lg' ? 'h-14 w-14 rounded-2xl' : 'h-11 w-11 rounded-xl'
  const glyph = size === 'sm' ? 16 : size === 'lg' ? 28 : 22
  const text = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-3xl' : 'text-2xl'
  let inner
  switch (subject.icon) {
    case 'pi':
      inner = <span className={`${text} font-semibold leading-none`}>π</span>
      break
    case 'flask':
      inner = <FlaskConical size={glyph} strokeWidth={2.2} />
      break
    case 'book':
      inner = <BookOpen size={glyph} strokeWidth={2.2} />
      break
    case 'globe':
      inner = <Globe2 size={glyph} strokeWidth={2.2} />
      break
    case 'cpu':
      inner = <Cpu size={glyph} strokeWidth={2.2} />
      break
    default:
      inner = <span className={`${size === 'sm' ? 'text-sm' : 'text-xl'} font-bold leading-none`}>ಕ</span>
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center bg-gradient-to-br text-white shadow-sm ${box} ${iconColors[subject.color]}`}
    >
      {inner}
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        className={`max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-ink md:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function Pill({ children, tone = 'slate' }) {
  const tones = {
    rose: 'bg-rose-50 text-rose-500',
    blue: 'bg-blue-50 text-blue-600',
    slate: 'bg-slate-100 text-slate-600',
    green: 'bg-emerald-50 text-emerald-600',
    orange: 'bg-orange-50 text-orange-600',
    violet: 'bg-violet-50 text-violet-600',
  }
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${tones[tone]}`}>{children}</span>
}
