import { useId, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  FileQuestion,
  FileText,
  Megaphone,
  NotebookPen,
  Sparkles,
  Target,
  Trophy,
  BookMarked,
  Bell,
  Users,
  Flag,
  UserRound,
  MessageSquareText,
  Plus,
  Trash2,
  Loader2,
} from 'lucide-react'
import { greetingKey, todaysClasses, useApp } from '../AppContext'
import { timetable } from '../../shared/catalog'
import { currentMonthPct } from '../lib/attendance'
import { dateLabel } from '../lib/dates'
import { Card, Modal, Pill, ProgressBar, SectionHeader, SubjectIcon } from './ui'
import { LeafDecoration, MoonIcon, RobotIcon, Sparkle, SunIcon } from './Illustrations'
import hero from '../assets/hero-student.png'

function useGreeting() {
  const { t, tr, user } = useApp()
  const key = greetingKey()
  return { key, text: `${t(key)}, ${tr(user.firstName)}!` }
}

export function HeroBanner() {
  const { t } = useApp()
  const { key, text } = useGreeting()
  return (
    <section className="relative hidden h-[168px] overflow-hidden rounded-3xl bg-gradient-to-r from-[#1d296d] via-[#3b3a9e] to-[#6457cf] text-white lg:block">
      <Sparkle className="absolute left-[46%] top-5 h-3 w-3 text-white/70" />
      <Sparkle className="absolute left-[40%] bottom-8 h-2 w-2 text-white/50" />
      <div className="relative z-10 flex h-full items-start gap-4 py-5 pl-7 pr-4">
        {key === 'goodEvening' ? <MoonIcon className="mt-1 h-12 w-12 shrink-0" /> : <SunIcon className="h-14 w-14 shrink-0" />}
        <div className="max-w-[470px] pt-1">
          <h1 className="text-[32px] font-bold leading-tight tracking-tight">{text}</h1>
          <p className="mt-2 text-[15px] leading-snug text-white/90">{t('heroLine')}</p>
          <p className="mt-3 text-[14px] italic text-white/85">{t('heroQuote')}</p>
        </div>
      </div>
      <img
        src={hero}
        alt=""
        className="pointer-events-none absolute bottom-0 right-[24%] h-full select-none object-contain xl:right-[25.5%]"
        style={{ maskImage: 'linear-gradient(to right, transparent 0, black 14%, black 92%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to right, transparent 0, black 14%, black 92%, transparent 100%)' }}
        draggable="false"
      />
      <div className="absolute right-11 top-1/2 z-10 hidden w-[260px] -translate-y-1/2 overflow-hidden rounded-2xl bg-white/10 px-5 py-5 ring-1 ring-white/15 backdrop-blur-sm xl:block">
        <LeafDecoration className="absolute -bottom-2 right-3 h-24 w-16 text-white/40" />
        <p className="text-[18px] font-semibold">{t('doingGreat')}</p>
        <p className="mt-2 text-[15px] text-white/80">ಮುಂದುವರಿಯಿರಿ</p>
        <p className="text-[14px] text-white/70">(Keep going!)</p>
      </div>
    </section>
  )
}

export function MobileHero() {
  const { t, tr, user } = useApp()
  const { key } = useGreeting()
  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#eef0ff] to-[#e4e2ff] p-4 lg:hidden">
      <div className="relative z-10 max-w-[60%]">
        <div className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
          <SunIcon className="h-5 w-5" /> {t(key)},
        </div>
        <h1 className="mt-0.5 text-2xl font-bold text-ink">{tr(user.firstName)}!</h1>
        <p className="mt-1 text-xs text-muted">ಮುಂದುವರಿಯಿರಿ (Keep going!)</p>
      </div>
      <img
        src={hero}
        alt=""
        className="absolute -right-6 bottom-0 h-full select-none object-cover"
        style={{
          objectPosition: '30% 50%',
          width: '60%',
          maskImage: 'linear-gradient(to right, transparent 0, black 25%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0, black 25%)',
        }}
        draggable="false"
      />
    </section>
  )
}

export function useStats() {
  const { homework, data } = useApp()
  const due = homework.filter((h) => !h.done && (h.due === 'today' || h.due === 'tomorrow')).length
  const pct = currentMonthPct(data.attendance)
  return { classes: todaysClasses().filter(Boolean).length, due, exam: data.exams[0], attendance: pct === null ? '—' : `${pct}%` }
}

// The periods for today, or for the next school day when there are no classes today.
function upcomingSchoolDay() {
  for (let offset = 0; offset < 7; offset++) {
    const date = new Date()
    date.setDate(date.getDate() + offset)
    const day = todaysClasses(date)
    const slots = timetable.map((slot, i) => ({ ...slot, subject: day[i] })).filter((slot) => slot.subject)
    if (slots.length) return { slots, offset, date }
  }
  return { slots: [], offset: 0, date: new Date() }
}

function useDayHeading() {
  const { t, tr } = useApp()
  const { offset, date } = upcomingSchoolDay()
  if (offset === 0) return null
  const day = offset === 1 ? t('tomorrow') : tr(dateLabel(date, { weekday: 'long' }))
  return `${t('noClassesToday')} ${t('nextClasses')}: ${day}`
}

export function StatCards() {
  const { t, tr, subjectById } = useApp()
  const { classes, due, exam, attendance } = useStats()
  const cards = [
    { to: '/calendar', label: t('todaysClasses'), value: classes, unit: t('classes'), icon: BookOpen, tone: 'bg-violet-100 text-violet-600' },
    { to: '/homework', label: t('homeworkDue'), value: due, unit: t('tasksWord'), icon: ClipboardList, tone: 'bg-orange-100 text-orange-500' },
    {
      to: '/tests',
      label: t('nextExam'),
      value: exam ? exam.inDays : '—',
      unit: exam ? t('days') : null,
      sub: exam ? `${tr(subjectById[exam.subject].name)} – ${tr(exam.name)}` : t('noExams'),
      icon: CalendarDays,
      tone: 'bg-blue-100 text-blue-600',
    },
    { to: '/attendance', label: t('attendance'), value: attendance, sub: t('thisMonth'), icon: Users, tone: 'bg-emerald-100 text-emerald-600' },
  ]
  return (
    <div className="hidden grid-cols-4 gap-4 lg:grid">
      {cards.map((c) => (
        <Link key={c.label} to={c.to}>
          <Card className="flex h-full items-center gap-5 px-4 py-3 transition hover:-translate-y-0.5 hover:shadow-lg">
            <div className={`flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-2xl ${c.tone}`}>
              <c.icon size={28} strokeWidth={1.9} />
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-medium text-ink">{c.label}</div>
              <div className="flex items-baseline gap-2">
                <span className="text-[28px] font-bold leading-tight text-ink">{c.value}</span>
                {c.unit && <span className="text-[15px] text-muted">{c.unit}</span>}
              </div>
              {c.sub && <div className="truncate text-[13px] text-muted">{c.sub}</div>}
            </div>
          </Card>
        </Link>
      ))}
    </div>
  )
}

export function MobileStats() {
  const { t } = useApp()
  const { classes, due, exam, attendance } = useStats()
  const items = [
    { to: '/calendar', value: classes, label: t('classesShort'), color: 'text-brand-700' },
    { to: '/homework', value: due, label: t('homework'), color: 'text-rose-500' },
    { to: '/tests', value: exam ? exam.inDays : '—', unit: exam ? t('days') : null, label: t('nextExam'), color: 'text-brand-700' },
    { to: '/attendance', value: attendance, label: t('attendance'), color: 'text-emerald-600' },
  ]
  return (
    <Card className="grid grid-cols-4 divide-x divide-slate-100 lg:hidden">
      {items.map((i) => (
        <Link key={i.label} to={i.to} className="px-1 py-3 text-center">
          <div className={`text-lg font-bold ${i.color}`}>
            {i.value}
            {i.unit && <span className="ml-0.5 text-xs font-semibold">{i.unit}</span>}
          </div>
          <div className="truncate text-[10.5px] text-muted">{i.label}</div>
        </Link>
      ))}
    </Card>
  )
}

function nowMinutes() {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

// Timetable times after 12:00 are written 12-hour style (01:00, 02:00), as in the mockup.
function toMinutes(hhmm) {
  let [h, m] = hhmm.split(':').map(Number)
  if (h < 7) h += 12
  return h * 60 + m
}

export function Timetable() {
  const { t, tr, subjectById } = useApp()
  const { slots, offset } = upcomingSchoolDay()
  const heading = useDayHeading()
  // The LIVE badge only applies to today's periods.
  const now = offset === 0 ? nowMinutes() : -1
  return (
    <Card className="h-full p-5">
      <SectionHeader
        icon={<CalendarDays size={24} className="mt-0.5 text-violet-600" />}
        title={t('todaysTimetable')}
        subtitle="ಇಂದಿನ ವೇಳಾಪಟ್ಟಿ"
        to="/calendar"
      />
      <ol className="relative mt-3">
        <span className="absolute bottom-3 left-[7px] top-3 w-px bg-slate-200" />
        {heading && <li className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-700">{heading}</li>}
        {slots.map((slot) => {
          const live = now >= toMinutes(slot.start) && now < toMinutes(slot.end)
          return (
            <li key={slot.start}>
              <Link
                to={`/subjects/${slot.subject}`}
                className={`relative -mx-2 flex items-start gap-5 rounded-xl px-2 py-[3px] hover:bg-slate-50 ${live ? 'bg-brand-50' : ''}`}
              >
                <span className="relative z-10 mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ring-4 ring-white" style={{ background: slot.dot }} />
                <span className="w-[100px] shrink-0 pt-px text-[14px] text-ink">
                  {slot.start} – {slot.end}
                </span>
                <span className="min-w-0 flex-1 border-b border-slate-100 pb-1.5">
                  <span className="block text-[14px] font-medium text-ink">
                    {tr(subjectById[slot.subject].name)}
                    {live && <span className="ml-2 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold text-white">LIVE</span>}
                  </span>
                  <span className="block text-[12.5px] text-muted">{tr(slot.room)}</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

export function MobileClasses() {
  const { t, tr, subjectById } = useApp()
  const { slots } = upcomingSchoolDay()
  const heading = useDayHeading()
  return (
    <Card className="p-4 lg:hidden">
      <SectionHeader icon={<CalendarDays size={18} className="mt-0.5 text-violet-600" />} title={t('todaysClasses')} to="/calendar" />
      <ul className="divide-y divide-slate-100">
        {heading && <li className="py-2 text-[12px] text-amber-700">{heading}</li>}
        {slots.slice(0, 3).map((slot) => (
          <li key={slot.start}>
            <Link to={`/subjects/${slot.subject}`} className="flex items-center gap-3 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: slot.dot }} />
              <span className="w-11 text-xs text-muted">{slot.start}</span>
              <span className="flex-1">
                <span className="block text-sm font-medium text-ink">{tr(subjectById[slot.subject].name)}</span>
                <span className="block text-[11px] text-muted">{tr(slot.room)}</span>
              </span>
              <ChevronRight size={16} className="text-slate-400" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function ContinueLearning() {
  const { t, tr, subjects } = useApp()
  return (
    <Card className="flex h-full flex-col p-5">
      <SectionHeader
        icon={<BookOpen size={24} className="mt-0.5 text-blue-600" />}
        title={t('continueLearning')}
        to="/subjects"
        linkLabel={undefined}
      />
      <div className="-mx-1 flex flex-1 snap-x gap-3 overflow-x-auto px-1 pb-1 pt-2 lg:grid lg:auto-rows-fr lg:grid-cols-2 lg:overflow-visible">
        {subjects.slice(0, 4).map((s) => (
          <Link
            key={s.id}
            to={`/subjects/${s.id}`}
            className="flex min-w-[230px] snap-start flex-col justify-between rounded-2xl border border-slate-100 p-4 transition hover:border-brand-200 hover:shadow-card lg:min-w-0"
          >
            <div className="flex items-start gap-3">
              <SubjectIcon subject={s} />
              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-ink">{tr(s.name)}</div>
                <div className="truncate text-[12.5px] text-muted">{tr(s.topic)}</div>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <ProgressBar value={s.progress} />
              <span className="text-[13px] text-ink">{s.progress}%</span>
            </div>
          </Link>
        ))}
      </div>
    </Card>
  )
}

export function RevisionPlanModal({ open, onClose }) {
  const { t, tr, showToast, data, mutate, aiEnabled, errorText } = useApp()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(null)
  const plan = data.plan
  if (!plan) return null

  const regenerate = async () => {
    setBusy('ai')
    try {
      await mutate('/ai/plan', { method: 'POST' })
      showToast(t('planUpdated'))
    } catch {
      // mutate already showed the error.
    } finally {
      setBusy(null)
    }
  }

  const start = async () => {
    setBusy('start')
    try {
      await mutate('/plan/start', { method: 'POST' })
      onClose()
      showToast(t('planStarted'))
    } catch {
      // mutate already showed the error.
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={tr(plan.title)}>
      <p className="mb-4 text-sm text-muted">{tr(plan.summary)}</p>
      <ol className="space-y-2">
        {plan.steps.map((step, i) => (
          <li key={i} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
              {i + 1}
            </span>
            <span>
              <span className="block text-xs font-semibold text-brand-600">{tr(step.day)}</span>
              <span className="block text-sm text-ink">{tr(step.task)}</span>
            </span>
          </li>
        ))}
      </ol>
      {aiEnabled ? (
        <button
          onClick={regenerate}
          disabled={busy !== null}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 py-2.5 text-sm font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-60"
        >
          {busy === 'ai' ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {busy === 'ai' ? t('makingPlan') : t('newAiPlan')}
        </button>
      ) : (
        <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs text-muted">{t('aiOffNote')}</p>
      )}
      <div className="mt-3 flex gap-3">
        <button
          onClick={start}
          disabled={busy !== null}
          className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {t('startPlan')}
        </button>
        <button
          onClick={() => {
            onClose()
            navigate('/tests?mock=1')
          }}
          className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-ink hover:bg-slate-50"
        >
          {t('takeMockTest')}
        </button>
      </div>
    </Modal>
  )
}

export function AICoach() {
  const { t, tr, data } = useApp()
  const plan = data.plan
  const [planOpen, setPlanOpen] = useState(false)
  const actions = [
    { icon: MessageSquareText, label: t('explainTopic'), prompt: 'Explain algebraic expressions' },
    { icon: FileQuestion, label: t('generateQuestions'), prompt: 'Generate practice questions on algebra' },
    { icon: NotebookPen, label: t('createNotes'), prompt: 'Create notes on Force and Motion' },
  ]
  return (
    <Card className="h-full p-5">
      <SectionHeader icon={<Sparkles size={24} className="mt-0.5 text-violet-600" fill="currentColor" />} title={t('aiStudyCoach')} />
      <div className="mt-2 flex items-center gap-3">
        <RobotIcon className="h-14 w-14 shrink-0" />
        <div className="rounded-2xl rounded-tl-sm bg-slate-50 px-4 py-2.5 text-[12.5px] leading-snug text-ink">{t('coachIntro')}</div>
      </div>
      <div className="mt-3 rounded-2xl border border-slate-100 p-4">
        <div className="flex items-center gap-2.5">
          <Target size={22} className="text-rose-500" />
          <span className="flex-1 text-[13.5px] font-medium text-ink">{plan ? tr(plan.title) : t('mathRevisionPlan')}</span>
          <button
            onClick={() => setPlanOpen(true)}
            className="flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-[12.5px] font-medium text-brand-700 hover:bg-brand-100"
          >
            {t('viewPlan')} <ArrowRight size={13} />
          </button>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">{plan ? tr(plan.summary) : t('planSummary')}</p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {actions.map((a) => (
          <Link
            key={a.label}
            to={`/ai-tutor?prompt=${encodeURIComponent(a.prompt)}`}
            className="flex flex-col items-center gap-2 rounded-xl bg-slate-50 px-1 py-3 text-center text-[11.5px] text-ink hover:bg-brand-50"
          >
            <a.icon size={20} className="text-violet-600" />
            {a.label}
          </Link>
        ))}
      </div>
      <RevisionPlanModal open={planOpen} onClose={() => setPlanOpen(false)} />
    </Card>
  )
}

const taskIconTone = {
  mathematics: 'bg-orange-100 text-orange-500',
  science: 'bg-blue-100 text-blue-600',
  english: 'bg-emerald-100 text-emerald-600',
  'social-science': 'bg-amber-100 text-amber-600',
  kannada: 'bg-pink-100 text-pink-500',
  'computer-science': 'bg-violet-100 text-violet-600',
}

export function DuePill({ item }) {
  const { tr } = useApp()
  const tone = item.due === 'today' || item.due === 'overdue' ? 'rose' : item.due === 'tomorrow' ? 'blue' : 'slate'
  return <Pill tone={tone}>{tr(item.dueLabel)}</Pill>
}

export function TaskIcon({ subject }) {
  return (
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${taskIconTone[subject]}`}>
      <FileText size={14} />
    </span>
  )
}

export function UpcomingTasks() {
  const { t, tr, homework } = useApp()
  const upcoming = homework.filter((h) => !h.done).slice(0, 4)
  return (
    <Card className="h-full p-5">
      <SectionHeader icon={<ClipboardList size={22} className="mt-0.5 text-violet-600" />} title={t('upcomingTasks')} to="/homework" />
      <ul className="divide-y divide-slate-100">
        {upcoming.map((h) => (
          <li key={h.id}>
            <Link to="/homework" className="flex items-center gap-3 py-2">
              <TaskIcon subject={h.subject} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-ink">{tr(h.title)}</span>
                <span className="block truncate text-[12px] text-muted">{tr(h.detail)}</span>
              </span>
              <DuePill item={h} />
            </Link>
          </li>
        ))}
        {upcoming.length === 0 && <li className="py-6 text-center text-sm text-muted">🎉 {t('noNotifications')}</li>}
      </ul>
    </Card>
  )
}

export function ProgressRing({ value, size = 128, stroke = 12, label, sub }) {
  const id = useId().replace(/:/g, '')
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef1f8" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#1d6ff2" />
            <stop offset="1" stopColor="#38a3ff" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[22px] font-bold text-ink">{label ?? `${value}%`}</span>
        {sub && <span className="text-[12px] text-muted">{sub}</span>}
      </div>
    </div>
  )
}

function GoalsModal({ open, onClose }) {
  const { t, tr, goals, addGoal, deleteGoal, toggleGoal } = useApp()
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    if (!label.trim()) return
    setSaving(true)
    try {
      await addGoal(label.trim())
      setLabel('')
    } catch {
      // The toast already explains what went wrong.
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title={t('weeklyGoal')}>
      <form onSubmit={submit} className="mb-4 flex gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={140}
          placeholder={t('newGoalPlaceholder')}
          className="h-11 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-brand-500 focus:bg-white"
        />
        <button disabled={saving || !label.trim()} className="flex h-11 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} {t('add')}
        </button>
      </form>
      <ul className="space-y-1.5">
        {goals.length === 0 && <li className="py-4 text-center text-sm text-muted">{t('noGoals')}</li>}
        {goals.map((g) => (
          <li key={g.id} className="flex items-center gap-2.5 rounded-xl border border-slate-100 px-3 py-2">
            <button
              onClick={() => toggleGoal(g.id)}
              aria-label={g.done ? t('markUndone') : t('markDone')}
              className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border ${g.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white'}`}
            >
              {g.done && <Check size={13} strokeWidth={3} />}
            </button>
            <span className="flex-1 text-sm text-ink">{tr(g.label)}</span>
            <button onClick={() => deleteGoal(g.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500" aria-label={t('delete')}>
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

export function WeeklyGoal() {
  const { t, tr, goals, toggleGoal, lang } = useApp()
  const [editing, setEditing] = useState(false)
  const done = goals.filter((g) => g.done).length
  const pct = goals.length ? Math.round((done / goals.length) * 100) : 0
  const summary = lang === 'kn' ? `${goals.length} ${t('of')} ${done} ${t('completed')}` : `${done} ${t('of')} ${goals.length} ${t('completed')}`
  return (
    <Card className="h-full p-5">
      <SectionHeader
        icon={<Target size={24} className="mt-0.5 text-rose-500" />}
        title={t('weeklyGoal')}
        subtitle={summary}
        onLink={() => setEditing(true)}
        linkLabel={t('edit')}
      />
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <ProgressRing value={pct} size={124} stroke={11} sub={t('thisWeek')} />
        <ul className="w-full space-y-1.5">
          {goals.length === 0 && (
            <li>
              <button onClick={() => setEditing(true)} className="flex items-center gap-2 text-[13px] font-medium text-brand-600">
                <Plus size={15} /> {t('addGoal')}
              </button>
            </li>
          )}
          {goals.slice(0, 6).map((g) => (
            <li key={g.id}>
              <button onClick={() => toggleGoal(g.id)} className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left hover:bg-slate-50">
                <span
                  className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition ${
                    g.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white'
                  }`}
                >
                  {g.done && <Check size={13} strokeWidth={3} />}
                </span>
                <span className="text-[13px] text-ink">{tr(g.label)}</span>
              </button>
            </li>
          ))}
          {goals.length > 6 && (
            <li>
              <button onClick={() => setEditing(true)} className="px-1 text-[12.5px] font-medium text-brand-600">
                +{goals.length - 6} {t('more')}
              </button>
            </li>
          )}
        </ul>
      </div>
      <GoalsModal open={editing} onClose={() => setEditing(false)} />
    </Card>
  )
}

const announcementIcons = {
  bell: { icon: Bell, tone: 'text-rose-500' },
  trophy: { icon: Trophy, tone: 'text-amber-500' },
  book: { icon: BookMarked, tone: 'text-blue-600' },
  users: { icon: UserRound, tone: 'text-violet-600' },
  flag: { icon: Flag, tone: 'text-orange-500' },
}

export function AnnouncementIcon({ name, size = 20 }) {
  const { icon: Icon, tone } = announcementIcons[name] ?? announcementIcons.bell
  return <Icon size={size} className={`shrink-0 ${tone}`} fill="currentColor" fillOpacity={0.15} />
}

export function Announcements() {
  const { t, tr, data } = useApp()
  const announcements = data.announcements
  return (
    <Card className="h-full p-5">
      <SectionHeader icon={<Megaphone size={22} className="mt-0.5 text-rose-500" />} title={t('schoolAnnouncements')} to="/announcements" />
      <ul className="space-y-1">
        {announcements.length === 0 && <li className="py-6 text-center text-sm text-muted">{t('noAnnouncements')}</li>}
        {announcements.slice(0, 3).map((a) => (
          <li key={a.id}>
            <Link to="/announcements" className="flex items-start gap-3 rounded-xl px-1 py-2 hover:bg-slate-50">
              <span className="mt-0.5">
                <AnnouncementIcon name={a.icon} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] font-semibold text-ink">{tr(a.title)}</span>
                  {a.important && <span className="rounded-md bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-600">{t('important')}</span>}
                </span>
                <span className="block text-[12px] text-muted">{tr(a.body)}</span>
              </span>
              <span className="shrink-0 text-[12px] text-muted">{tr(a.time)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
