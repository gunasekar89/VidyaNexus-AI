import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarCheck, ClipboardList, FileText, GraduationCap, Loader2, Megaphone, Plus, Trash2, Trophy, Users } from 'lucide-react'
import { useApp } from '../AppContext'
import { api } from '../api'
import { awardCategories, awardLevels, awardMedals, subjectById, subjects } from '../../shared/catalog'
import { dateLabel, isoDate, relativeTime } from '../lib/dates'
import { Card, PageHeader, Pill, SubjectIcon } from '../components/ui'
import { Avatar } from '../components/Layout'
import { AnnouncementIcon } from '../components/dashboard'

const field = 'h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-ink outline-none focus:border-brand-500 focus:bg-white'
const area = 'min-h-[88px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand-500 focus:bg-white'

function Label({ children, className = '' }) {
  return <span className={`mb-1 block text-xs font-medium text-muted ${className}`}>{children}</span>
}

// English + Kannada inputs for one piece of text.
function BilingualInput({ name, label, values, onChange, multiline, required }) {
  const Tag = multiline ? 'textarea' : 'input'
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {['En', 'Kn'].map((l) => (
        <label key={l} className="block">
          <Label>
            {label} · {l === 'En' ? 'English' : 'ಕನ್ನಡ'}
          </Label>
          <Tag
            value={values[`${name}${l}`] ?? ''}
            onChange={(e) => onChange(`${name}${l}`, e.target.value)}
            className={multiline ? area : field}
            required={required && l === 'En' && !values[`${name}Kn`]}
            lang={l === 'Kn' ? 'kn' : 'en'}
          />
        </label>
      ))}
    </div>
  )
}

function SubjectSelect({ value, onChange }) {
  const { tr } = useApp()
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={field}>
      {subjects.map((s) => (
        <option key={s.id} value={s.id}>
          {tr(s.name)}
        </option>
      ))}
    </select>
  )
}

// Shared add-form wrapper: posts the form, then reloads the desk.
function useForm(initial, path, reload, { afterSave, extra } = {}) {
  const { showToast, errorText, t } = useApp()
  const [values, setValues] = useState(initial)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setValues((s) => ({ ...s, [k]: v }))
  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api(path, { method: 'POST', body: { ...values, ...extra?.() } })
      setValues(initial)
      showToast(t('saved'))
      afterSave?.()
      await reload()
    } catch (err) {
      showToast(errorText(err))
    } finally {
      setSaving(false)
    }
  }
  return { values, set, submit, saving }
}

function SaveButton({ saving, label }) {
  const { t } = useApp()
  return (
    <button disabled={saving} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
      {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} {label ?? t('add')}
    </button>
  )
}

function DeleteButton({ path, reload }) {
  const { t, showToast, errorText } = useApp()
  return (
    <button
      onClick={async () => {
        if (!window.confirm(t('confirmDelete'))) return
        try {
          await api(path, { method: 'DELETE' })
          await reload()
        } catch (err) {
          showToast(errorText(err))
        }
      }}
      className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
      aria-label={t('delete')}
    >
      <Trash2 size={16} />
    </button>
  )
}

function TranslateHint() {
  const { t, aiEnabled } = useApp()
  return <p className="text-xs text-muted">{aiEnabled ? t('translateHintAi') : t('translateHintOff')}</p>
}

function HomeworkTab({ desk, reload }) {
  const { t, tr } = useApp()
  const f = useForm({ subject: 'mathematics', dueDate: isoDate(), project: false }, '/teacher/homework', reload)
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
      <Card className="p-5">
        <h2 className="mb-4 font-semibold text-ink">{t('addHomework')}</h2>
        <form onSubmit={f.submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <Label>{t('subject')}</Label>
              <SubjectSelect value={f.values.subject} onChange={(v) => f.set('subject', v)} />
            </label>
            <label>
              <Label>{t('dueDate')}</Label>
              <input type="date" required value={f.values.dueDate} onChange={(e) => f.set('dueDate', e.target.value)} className={field} />
            </label>
          </div>
          <BilingualInput name="title" label={t('title')} values={f.values} onChange={f.set} required />
          <BilingualInput name="detail" label={t('details')} values={f.values} onChange={f.set} />
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={f.values.project} onChange={(e) => f.set('project', e.target.checked)} /> {t('isProject')}
          </label>
          <TranslateHint />
          <SaveButton saving={f.saving} />
        </form>
      </Card>
      <Card className="divide-y divide-slate-100">
        {desk.homework.length === 0 && <p className="p-6 text-center text-sm text-muted">{t('nothingYet')}</p>}
        {desk.homework.map((h) => (
          <div key={h.id} className="flex items-center gap-3 p-4">
            <SubjectIcon subject={subjectById[h.subject]} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink">{tr(h.title)}</div>
              <div className="truncate text-xs text-muted">
                {tr(h.detail) || tr(subjectById[h.subject].name)} · {t('due')} {tr(dateLabel(h.dueDate))}
              </div>
            </div>
            <Pill tone={h.doneCount === desk.students.length ? 'green' : 'slate'}>
              {h.doneCount}/{desk.students.length} {t('done')}
            </Pill>
            <DeleteButton path={`/teacher/homework/${h.id}`} reload={reload} />
          </div>
        ))}
      </Card>
    </div>
  )
}

const categoryLabels = {
  general: { en: 'General', kn: 'ಸಾಮಾನ್ಯ' },
  holiday: { en: 'Holiday', kn: 'ರಜೆ' },
  event: { en: 'Event', kn: 'ಕಾರ್ಯಕ್ರಮ' },
  meeting: { en: 'Meeting', kn: 'ಸಭೆ' },
  celebration: { en: 'Celebration', kn: 'ಆಚರಣೆ' },
  library: { en: 'Library', kn: 'ಗ್ರಂಥಾಲಯ' },
}

function AnnouncementsTab({ desk, reload }) {
  const { t, tr } = useApp()
  const f = useForm({ category: 'general', important: false, eventDate: '' }, '/teacher/announcements', reload)
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
      <Card className="p-5">
        <h2 className="mb-4 font-semibold text-ink">{t('newAnnouncement')}</h2>
        <form onSubmit={f.submit} className="space-y-3">
          <BilingualInput name="title" label={t('title')} values={f.values} onChange={f.set} required />
          <BilingualInput name="body" label={t('message')} values={f.values} onChange={f.set} multiline required />
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <Label>{t('category')}</Label>
              <select value={f.values.category} onChange={(e) => f.set('category', e.target.value)} className={field}>
                {desk.categories.map((c) => (
                  <option key={c} value={c}>
                    {tr(categoryLabels[c])}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <Label>{t('eventDateOptional')}</Label>
              <input type="date" value={f.values.eventDate} onChange={(e) => f.set('eventDate', e.target.value)} className={field} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={f.values.important} onChange={(e) => f.set('important', e.target.checked)} /> {t('markImportant')}
          </label>
          <TranslateHint />
          <SaveButton saving={f.saving} label={t('post')} />
        </form>
      </Card>
      <Card className="divide-y divide-slate-100">
        {desk.announcements.length === 0 && <p className="p-6 text-center text-sm text-muted">{t('nothingYet')}</p>}
        {desk.announcements.map((a) => (
          <div key={a.id} className="flex items-start gap-3 p-4">
            <span className="mt-0.5">
              <AnnouncementIcon name={a.icon} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-ink">{tr(a.title)}</span>
                {a.important && <span className="rounded-md bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-600">{t('important')}</span>}
              </div>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted">{tr(a.body)}</p>
              <p className="mt-1 text-[11px] text-slate-400">
                {tr(categoryLabels[a.category])} · {tr(relativeTime(a.createdAt))}
                {a.eventDate && ` · ${tr(dateLabel(a.eventDate))}`}
              </p>
            </div>
            <DeleteButton path={`/teacher/announcements/${a.id}`} reload={reload} />
          </div>
        ))}
      </Card>
    </div>
  )
}

function ExamsTab({ desk, reload }) {
  const { t, tr } = useApp()
  const exams = useForm({ subject: 'mathematics', date: '' }, '/teacher/exams', reload)
  const [scores, setScores] = useState({})
  const results = useForm({ subject: 'mathematics', max: 50 }, '/teacher/results', reload, { afterSave: () => setScores({}), extra: () => ({ scores }) })
  const studentName = Object.fromEntries(desk.students.map((s) => [s.id, s.name]))

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="space-y-4">
        <Card className="p-5">
          <h2 className="mb-4 font-semibold text-ink">{t('scheduleExam')}</h2>
          <form onSubmit={exams.submit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <Label>{t('subject')}</Label>
                <SubjectSelect value={exams.values.subject} onChange={(v) => exams.set('subject', v)} />
              </label>
              <label>
                <Label>{t('date')}</Label>
                <input type="date" required value={exams.values.date} onChange={(e) => exams.set('date', e.target.value)} className={field} />
              </label>
            </div>
            <BilingualInput name="name" label={t('examName')} values={exams.values} onChange={exams.set} required />
            <BilingualInput name="syllabus" label={t('syllabus')} values={exams.values} onChange={exams.set} />
            <TranslateHint />
            <SaveButton saving={exams.saving} />
          </form>
        </Card>
        <Card className="divide-y divide-slate-100">
          {desk.exams.length === 0 && <p className="p-6 text-center text-sm text-muted">{t('nothingYet')}</p>}
          {desk.exams.map((e) => (
            <div key={e.id} className="flex items-center gap-3 p-4">
              <SubjectIcon subject={subjectById[e.subject]} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ink">
                  {tr(subjectById[e.subject].name)} – {tr(e.name)}
                </div>
                <div className="text-xs text-muted">{tr(dateLabel(e.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}</div>
              </div>
              <DeleteButton path={`/teacher/exams/${e.id}`} reload={reload} />
            </div>
          ))}
        </Card>
      </div>
      <div className="space-y-4">
        <Card className="p-5">
          <h2 className="mb-4 font-semibold text-ink">{t('enterMarks')}</h2>
          <form onSubmit={results.submit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <Label>{t('subject')}</Label>
                <SubjectSelect value={results.values.subject} onChange={(v) => results.set('subject', v)} />
              </label>
              <label>
                <Label>{t('maxMarks')}</Label>
                <input type="number" min="1" max="1000" required value={results.values.max} onChange={(e) => results.set('max', e.target.value)} className={field} />
              </label>
            </div>
            <BilingualInput name="name" label={t('assessment')} values={results.values} onChange={results.set} required />
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
              {desk.students.map((s) => (
                <label key={s.id} className="flex items-center gap-3 px-3 py-2">
                  <Avatar user={s} className="h-8 w-8 text-sm" />
                  <span className="flex-1 text-sm text-ink">{s.name}</span>
                  <input
                    type="number"
                    min="0"
                    max={results.values.max}
                    step="0.5"
                    value={scores[s.id] ?? ''}
                    onChange={(e) => setScores((sc) => ({ ...sc, [s.id]: e.target.value }))}
                    className="h-9 w-20 rounded-lg border border-slate-200 bg-slate-50 px-2 text-right text-sm"
                  />
                </label>
              ))}
            </div>
            <TranslateHint />
            <SaveButton saving={results.saving} label={t('save')} />
          </form>
        </Card>
        <Card className="divide-y divide-slate-100">
          {desk.results.slice(0, 20).map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3">
              <SubjectIcon subject={subjectById[r.subject]} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{studentName[r.studentId]}</div>
                <div className="truncate text-xs text-muted">
                  {tr(subjectById[r.subject].name)} · {tr(r.name)}
                </div>
              </div>
              <span className="text-sm font-semibold text-ink">
                {r.score}/{r.max}
              </span>
              <DeleteButton path={`/teacher/results/${r.id}`} reload={reload} />
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}

const statusTone = {
  P: 'bg-emerald-500 text-white border-emerald-500',
  A: 'bg-rose-500 text-white border-rose-500',
  H: 'bg-amber-100 text-amber-700 border-amber-200',
}

function AttendanceTab({ desk, reload, date, setDate }) {
  const { t, showToast, errorText } = useApp()
  const [marks, setMarks] = useState({})
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    setMarks(Object.fromEntries(desk.students.map((s) => [s.id, s.attendance])))
  }, [desk])
  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api('/teacher/attendance', { method: 'PUT', body: { date, marks } })
      showToast(t('saved'))
      await reload()
    } catch (err) {
      showToast(errorText(err))
    } finally {
      setSaving(false)
    }
  }
  const options = [
    ['P', t('present')],
    ['A', t('absent')],
    ['H', t('holiday')],
  ]
  return (
    <Card className="max-w-3xl p-5">
      <form onSubmit={save}>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label>
          <Label>{t('date')}</Label>
          <input type="date" value={date} max={desk.today} onChange={(e) => e.target.value && setDate(e.target.value)} className={field} />
        </label>
        <button
          type="button"
          onClick={() => setMarks(Object.fromEntries(desk.students.map((s) => [s.id, 'P'])))}
          className="h-11 rounded-xl border border-slate-200 px-4 text-sm font-medium text-ink hover:bg-slate-50"
        >
          {t('allPresent')}
        </button>
      </div>
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
        {desk.students.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
            <Avatar user={s} className="h-9 w-9 text-sm" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-ink">{s.name}</div>
              <div className="text-xs text-muted">{s.rollNo}</div>
            </div>
            <div className="flex gap-1.5">
              {options.map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setMarks((m) => ({ ...m, [s.id]: m[s.id] === k ? null : k }))}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${marks[s.id] === k ? statusTone[k] : 'border-slate-200 text-muted hover:bg-slate-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <SaveButton saving={saving} label={t('saveAttendance')} />
      </div>
      </form>
    </Card>
  )
}

function StudentsTab({ desk, reload }) {
  const { t } = useApp()
  const f = useForm({}, '/teacher/students', reload)
  const input = (k, label, type = 'text', extra = {}) => (
    <label>
      <Label>{label}</Label>
      <input type={type} value={f.values[k] ?? ''} onChange={(e) => f.set(k, e.target.value)} className={field} {...extra} />
    </label>
  )
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
      <Card className="p-5">
        <h2 className="mb-4 font-semibold text-ink">{t('addStudent')}</h2>
        <form onSubmit={f.submit} className="grid gap-3 sm:grid-cols-2">
          {input('name', t('fullName'), 'text', { required: true })}
          {input('rollNo', t('rollNo'))}
          {input('email', t('email'), 'email', { required: true })}
          {input('password', t('startingPassword'), 'text', { required: true, minLength: 8 })}
          {input('guardian', t('guardian'))}
          {input('phone', t('phone'), 'tel')}
          <div className="sm:col-span-2">
            <SaveButton saving={f.saving} />
          </div>
        </form>
      </Card>
      <Card className="divide-y divide-slate-100">
        {desk.students.map((s) => (
          <div key={s.id} className="flex items-center gap-3 p-4">
            <Avatar user={s} className="h-10 w-10 text-sm" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-ink">{s.name}</div>
              <div className="truncate text-xs text-muted">
                {s.rollNo} · {s.email}
              </div>
            </div>
          </div>
        ))}
      </Card>
    </div>
  )
}

function OptionSelect({ value, onChange, options, icons }) {
  const { tr } = useApp()
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={field}>
      {Object.entries(options).map(([k, o]) => (
        <option key={k} value={k}>
          {icons && o.icon ? `${o.icon} ` : ''}
          {tr(o)}
        </option>
      ))}
    </select>
  )
}

function AwardsTab({ desk, reload }) {
  const { t, tr } = useApp()
  const f = useForm(
    { studentId: desk.students[0]?.id ?? '', category: 'academic', level: 'school', medal: 'gold', date: isoDate() },
    '/teacher/awards',
    reload,
  )
  const studentName = Object.fromEntries(desk.students.map((s) => [s.id, s.name]))
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
      <Card className="p-5">
        <h2 className="mb-4 font-semibold text-ink">{t('giveAward')}</h2>
        <form onSubmit={f.submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <Label>{t('student')}</Label>
              <select required value={f.values.studentId} onChange={(e) => f.set('studentId', e.target.value)} className={field}>
                {desk.students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <Label>{t('date')}</Label>
              <input type="date" required value={f.values.date} onChange={(e) => f.set('date', e.target.value)} className={field} />
            </label>
          </div>
          <BilingualInput name="title" label={t('awardName')} values={f.values} onChange={f.set} required />
          <BilingualInput name="note" label={t('details')} values={f.values} onChange={f.set} />
          <div className="grid gap-3 sm:grid-cols-3">
            <label>
              <Label>{t('place')}</Label>
              <OptionSelect value={f.values.medal} onChange={(v) => f.set('medal', v)} options={awardMedals} icons />
            </label>
            <label>
              <Label>{t('category')}</Label>
              <OptionSelect value={f.values.category} onChange={(v) => f.set('category', v)} options={awardCategories} icons />
            </label>
            <label>
              <Label>{t('level')}</Label>
              <OptionSelect value={f.values.level} onChange={(v) => f.set('level', v)} options={awardLevels} />
            </label>
          </div>
          <TranslateHint />
          <SaveButton saving={f.saving} label={t('giveAward')} />
        </form>
      </Card>
      <Card className="divide-y divide-slate-100">
        {desk.awards.length === 0 && <p className="p-6 text-center text-sm text-muted">{t('nothingYet')}</p>}
        {desk.awards.map((a) => (
          <div key={a.id} className="flex items-center gap-3 p-4">
            <span className="text-3xl">{awardMedals[a.medal]?.icon ?? '🏆'}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink">{tr(a.title)}</div>
              <div className="truncate text-xs text-muted">
                {studentName[a.studentId]} · {tr(awardLevels[a.level])} · {tr(dateLabel(a.date, { day: 'numeric', month: 'short', year: 'numeric' }))}
              </div>
            </div>
            <DeleteButton path={`/teacher/awards/${a.id}`} reload={reload} />
          </div>
        ))}
      </Card>
    </div>
  )
}

const tabs = [
  { key: 'homework', label: 'homework', icon: FileText, Component: HomeworkTab },
  { key: 'announcements', label: 'announcements', icon: Megaphone, Component: AnnouncementsTab },
  { key: 'exams', label: 'examsAndMarks', icon: ClipboardList, Component: ExamsTab },
  { key: 'attendance', label: 'attendance', icon: CalendarCheck, Component: AttendanceTab },
  { key: 'awards', label: 'awards', icon: Trophy, Component: AwardsTab },
  { key: 'students', label: 'students', icon: Users, Component: StudentsTab },
]

export default function TeacherDesk({ tab: fixedTab }) {
  const { t, tr, user, errorText } = useApp()
  const [params, setParams] = useSearchParams()
  const tab = fixedTab ?? (tabs.some((x) => x.key === params.get('tab')) ? params.get('tab') : 'homework')
  const [desk, setDesk] = useState(null)
  const [error, setError] = useState(null)
  const [date, setDate] = useState(isoDate())

  const reload = useCallback(async () => {
    try {
      setDesk(await api(`/teacher/overview?date=${date}`))
      setError(null)
    } catch (err) {
      setError(errorText(err))
    }
  }, [date, errorText])

  useEffect(() => {
    reload()
  }, [reload])

  const active = tabs.find((x) => x.key === tab)
  return (
    <div>
      <PageHeader
        title={fixedTab ? t(active.label) : `${t('teacherDesk')}`}
        subtitle={`${tr(user.school)} · ${t('class7a')}`}
        action={
          <span className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm text-muted shadow-card">
            <GraduationCap size={16} className="text-brand-600" /> {desk ? desk.students.length : '…'} {t('studentsWord')}
          </span>
        }
      />
      {!fixedTab && (
        <div className="mb-4 flex gap-2 overflow-x-auto">
          {tabs.map((x) => (
            <button
              key={x.key}
              onClick={() => setParams({ tab: x.key }, { replace: true })}
              className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium ${tab === x.key ? 'bg-brand-600 text-white' : 'bg-white text-muted shadow-card'}`}
            >
              <x.icon size={15} /> {t(x.label)}
            </button>
          ))}
        </div>
      )}
      {error && <Card className="p-6 text-center text-sm text-rose-600">{error}</Card>}
      {!desk && !error && (
        <div className="flex justify-center py-16 text-muted">
          <Loader2 className="animate-spin" />
        </div>
      )}
      {desk && <active.Component desk={desk} reload={reload} date={date} setDate={setDate} />}
    </div>
  )
}
