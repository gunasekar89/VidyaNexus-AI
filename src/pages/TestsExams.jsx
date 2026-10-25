import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarDays, CheckCircle2, XCircle } from 'lucide-react'
import { useApp } from '../AppContext'
import { exams, mockTest, results, subjectById } from '../data/mock'
import { Card, Modal, PageHeader, ProgressBar, SubjectIcon } from '../components/ui'

function MockTest({ open, onClose }) {
  const { t, tr } = useApp()
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState(null)
  const [score, setScore] = useState(0)
  const [finished, setFinished] = useState(false)

  const reset = () => {
    setIndex(0)
    setPicked(null)
    setScore(0)
    setFinished(false)
  }

  useEffect(() => {
    if (open) reset()
  }, [open])

  const q = mockTest[index]
  const next = () => {
    const newScore = score + (picked === q.answer ? 1 : 0)
    setScore(newScore)
    setPicked(null)
    if (index + 1 < mockTest.length) setIndex(index + 1)
    else setFinished(true)
  }

  return (
    <Modal open={open} onClose={onClose} title={t('mockTest')}>
      {finished ? (
        <div className="py-4 text-center">
          <div className="text-5xl">{score >= 4 ? '🏆' : score >= 3 ? '👏' : '💪'}</div>
          <p className="mt-3 text-sm text-muted">{t('yourScore')}</p>
          <p className="text-4xl font-bold text-ink">
            {score} / {mockTest.length}
          </p>
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
              {t('question')} {index + 1} / {mockTest.length}
            </span>
          </div>
          <ProgressBar value={(index / mockTest.length) * 100} />
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
                  key={o}
                  disabled={revealed}
                  onClick={() => setPicked(i)}
                  className={`flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left font-medium ${tone}`}
                >
                  {o}
                  {revealed && correct && <CheckCircle2 size={18} />}
                  {revealed && picked === i && !correct && <XCircle size={18} />}
                </button>
              )
            })}
          </div>
          <button
            onClick={next}
            disabled={picked === null}
            className="mt-5 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {index + 1 === mockTest.length ? t('finish') : t('next')}
          </button>
        </div>
      )}
    </Modal>
  )
}

export default function TestsExams() {
  const { t, tr, lang } = useApp()
  const [params, setParams] = useSearchParams()
  const [mockOpen, setMockOpen] = useState(params.get('mock') === '1')

  useEffect(() => {
    if (params.get('mock')) setParams({}, { replace: true })
  }, [params, setParams])

  return (
    <div>
      <PageHeader
        title={t('testsExams')}
        action={
          <button onClick={() => setMockOpen(true)} className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
            {t('takeMockTest')}
          </button>
        }
      />
      <h2 className="mb-3 text-lg font-semibold text-ink">{t('upcomingExams')}</h2>
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {exams.map((e) => {
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
                <CalendarDays size={15} className="text-muted" /> {tr(e.date)}
              </div>
              <div className="mt-1 text-sm text-muted">
                {t('syllabus')}: {tr(e.syllabus)}
              </div>
            </Card>
          )
        })}
      </div>
      <h2 className="mb-3 text-lg font-semibold text-ink">{t('recentResults')}</h2>
      <Card className="divide-y divide-slate-100">
        {results.map((r) => {
          const s = subjectById[r.subject]
          const pct = Math.round((r.score / r.max) * 100)
          return (
            <div key={r.subject} className="flex items-center gap-4 p-4">
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
      <MockTest open={mockOpen} onClose={() => setMockOpen(false)} key={lang} />
    </div>
  )
}
