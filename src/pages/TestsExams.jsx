import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarDays, CheckCircle2, Loader2, Sparkles, XCircle } from 'lucide-react'
import { useApp } from '../AppContext'
import { mockTest } from '../../shared/catalog'
import { api } from '../api'
import { relativeTime } from '../lib/dates'
import { Card, Modal, PageHeader, ProgressBar, SubjectIcon } from '../components/ui'

const builtInTest = { title: { en: 'Algebra Mock Test', kn: 'ಬೀಜಗಣಿತ ಅಣಕು ಪರೀಕ್ಷೆ' }, subject: 'mathematics', questions: mockTest }

function MockTest({ test, onClose }) {
  const { t, tr, mutate } = useApp()
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState(null)
  const [score, setScore] = useState(0)
  const [finished, setFinished] = useState(false)
  const questions = test?.questions ?? []

  const reset = () => {
    setIndex(0)
    setPicked(null)
    setScore(0)
    setFinished(false)
  }

  useEffect(() => {
    if (test) reset()
  }, [test])

  if (!test) return null
  const q = questions[index]
  const next = () => {
    const newScore = score + (picked === q.answer ? 1 : 0)
    setScore(newScore)
    setPicked(null)
    if (index + 1 < questions.length) setIndex(index + 1)
    else {
      setFinished(true)
      mutate('/tests/attempts', { method: 'POST', body: { subject: test.subject, title: test.title, score: newScore, total: questions.length } }).catch(() => {})
    }
  }

  return (
    <Modal open onClose={onClose} title={tr(test.title)}>
      {finished ? (
        <div className="py-4 text-center">
          <div className="text-5xl">{score / questions.length >= 0.8 ? '🏆' : score / questions.length >= 0.6 ? '👏' : '💪'}</div>
          <p className="mt-3 text-sm text-muted">{t('yourScore')}</p>
          <p className="text-4xl font-bold text-ink">
            {score} / {questions.length}
          </p>
          <p className="mt-2 text-xs text-muted">{t('scoreSaved')}</p>
          <div className="mt-6 flex gap-3">
            <button onClick={reset} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold">
              {t('retry')}
            </button>
            <button onClick={onClose} className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white">
              {t('close')}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-2 flex justify-between text-xs text-muted">
            <span>
              {t('question')} {index + 1} / {questions.length}
            </span>
          </div>
          <ProgressBar value={(index / questions.length) * 100} />
          <p className="mb-4 mt-5 text-lg font-semibold text-ink">{tr(q.q)}</p>
          <div className="grid grid-cols-2 gap-3">
            {q.options.map((o, i) => {
              const revealed = picked !== null
              const correct = i === q.answer
              const tone = !revealed
                ? 'border-slate-200 hover:border-brand-500 hover:bg-brand-50'
                : correct
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : picked === i
                    ? 'border-rose-400 bg-rose-50 text-rose-600'
                    : 'border-slate-200 opacity-60'
              return (
                <button
                  key={i}
                  disabled={revealed}
                  onClick={() => setPicked(i)}
                  className={`flex items-center justify-between gap-2 rounded-xl border-2 px-4 py-3 text-left font-medium ${tone}`}
                >
                  {o}
                  {revealed && correct && <CheckCircle2 size={18} className="shrink-0" />}
                  {revealed && picked === i && !correct && <XCircle size={18} className="shrink-0" />}
                </button>
              )
            })}
          </div>
          <button
            onClick={next}
            disabled={picked === null}
            className="mt-5 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {index + 1 === questions.length ? t('finish') : t('next')}
          </button>
        </div>
      )}
    </Modal>
  )
}

function PracticeTestCard({ onReady }) {
  const { t, tr, subjects, aiEnabled, errorText, showToast } = useApp()
  const [subject, setSubject] = useState('mathematics')
  const [busy, setBusy] = useState(false)
  const generate = async () => {
    setBusy(true)
    try {
      onReady(await api('/ai/practice-test', { method: 'POST', body: { subject } }))
    } catch (err) {
      showToast(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="mb-6 flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
      <Sparkles size={22} className="shrink-0 text-violet-600" />
      <div className="flex-1">
        <div className="font-semibold text-ink">{t('aiPracticeTest')}</div>
        <div className="text-sm text-muted">{aiEnabled ? t('aiPracticeTestHint') : t('aiOffNote')}</div>
      </div>
      <select
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        disabled={!aiEnabled}
        className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-ink"
      >
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {tr(s.name)}
          </option>
        ))}
      </select>
      <button
        onClick={generate}
        disabled={!aiEnabled || busy}
        className="flex h-10 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {busy && <Loader2 size={16} className="animate-spin" />}
        {busy ? t('preparing') : t('startTest')}
      </button>
    </Card>
  )
}

export default function TestsExams() {
  const { t, tr, data, subjectById } = useApp()
  const [params, setParams] = useSearchParams()
  const [test, setTest] = useState(params.get('mock') === '1' ? builtInTest : null)

  useEffect(() => {
    if (params.get('mock')) setParams({}, { replace: true })
  }, [params, setParams])

  return (
    <div>
      <PageHeader
        title={t('testsExams')}
        action={
          <button onClick={() => setTest(builtInTest)} className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
            {t('takeMockTest')}
          </button>
        }
      />
      <PracticeTestCard onReady={setTest} />
      <h2 className="mb-3 text-lg font-semibold text-ink">{t('upcomingExams')}</h2>
      {data.exams.length === 0 && <Card className="mb-6 p-6 text-center text-sm text-muted">{t('noExams')}</Card>}
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {data.exams.map((e) => {
          const s = subjectById[e.subject]
          return (
            <Card key={e.id} className="p-5">
              <div className="flex items-start gap-3">
                <SubjectIcon subject={s} />
                <div className="flex-1">
                  <div className="font-semibold text-ink">{tr(s.name)}</div>
                  <div className="text-sm text-muted">{tr(e.name)}</div>
                </div>
                <div className="rounded-xl bg-blue-50 px-3 py-1.5 text-center">
                  <div className="text-xl font-bold leading-none text-blue-600">{e.inDays}</div>
                  <div className="text-[10px] text-blue-600">{t('days')}</div>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm text-ink">
                <CalendarDays size={15} className="text-muted" /> {tr(e.dateLabel)}
              </div>
              {(e.syllabus.en || e.syllabus.kn) && (
                <div className="mt-1 text-sm text-muted">
                  {t('syllabus')}: {tr(e.syllabus)}
                </div>
              )}
            </Card>
          )
        })}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <h2 className="mb-3 text-lg font-semibold text-ink">{t('recentResults')}</h2>
          <Card className="divide-y divide-slate-100">
            {data.results.length === 0 && <p className="p-6 text-center text-sm text-muted">{t('noMarks')}</p>}
            {data.results.map((r) => {
              const s = subjectById[r.subject]
              const pct = Math.round((r.score / r.max) * 100)
              return (
                <div key={r.id} className="flex items-center gap-4 p-4">
                  <SubjectIcon subject={s} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-ink">{tr(s.name)}</div>
                    <div className="text-xs text-muted">{tr(r.name)}</div>
                  </div>
                  <div className="hidden w-40 sm:block">
                    <ProgressBar value={pct} />
                  </div>
                  <div className="w-20 text-right">
                    <span className="font-semibold text-ink">
                      {r.score}/{r.max}
                    </span>
                    <span className="block text-xs text-muted">{pct}%</span>
                  </div>
                </div>
              )
            })}
          </Card>
        </div>
        <div>
          <h2 className="mb-3 text-lg font-semibold text-ink">{t('myPracticeTests')}</h2>
          <Card className="divide-y divide-slate-100">
            {data.attempts.length === 0 && <p className="p-6 text-center text-sm text-muted">{t('noAttempts')}</p>}
            {data.attempts.slice(0, 8).map((a) => (
              <div key={a.id} className="flex items-center gap-3 p-4">
                <SubjectIcon subject={subjectById[a.subject] ?? subjectById.mathematics} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">{tr(a.title)}</div>
                  <div className="text-xs text-muted">{tr(relativeTime(a.createdAt))}</div>
                </div>
                <span className="font-semibold text-ink">
                  {a.score}/{a.total}
                </span>
              </div>
            ))}
          </Card>
        </div>
      </div>
      <MockTest test={test} onClose={() => setTest(null)} />
    </div>
  )
}
