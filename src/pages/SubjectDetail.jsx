import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Circle, PlayCircle, Sparkles } from 'lucide-react'
import { useApp } from '../AppContext'
import { Card, ProgressBar, SubjectIcon } from '../components/ui'
import { DuePill } from '../components/dashboard'

export default function SubjectDetail() {
  const { id } = useParams()
  const { t, tr, showToast, homework, subjectById, setChapterDone } = useApp()
  const s = subjectById[id]
  if (!s) return <Navigate to="/subjects" replace />
  const tasks = homework.filter((h) => h.subject === id)

  return (
    <div>
      <Link to="/subjects" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
        <ArrowLeft size={16} /> {t('subjects')}
      </Link>
      <Card className="mb-4 flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
        <SubjectIcon subject={s} size="lg" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-ink">{tr(s.name)}</h1>
          <p className="text-sm text-muted">
            {tr(s.topic)} · {t('teacher')}: {s.teacher}
          </p>
          <div className="mt-3 flex max-w-md items-center gap-3">
            <ProgressBar value={s.progress} />
            <span className="text-sm font-medium">{s.progress}%</span>
          </div>
        </div>
        <Link
          to={`/ai-tutor?prompt=${encodeURIComponent(`${t('explainPrompt')} ${tr(s.chapters.find((c) => c.current) ?? s.name)}`)}`}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Sparkles size={16} /> {t('aiTutor')}
        </Link>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <h2 className="mb-3 text-lg font-semibold text-ink">{t('chapters')}</h2>
          <ol className="space-y-2">
            {s.chapters.map((c, i) => (
              <li
                key={i}
                className={`flex items-center gap-3 rounded-xl border p-3 ${c.current ? 'border-brand-200 bg-brand-50' : 'border-slate-100'}`}
              >
                {c.done ? (
                  <CheckCircle2 size={20} className="text-emerald-500" />
                ) : c.current ? (
                  <PlayCircle size={20} className="text-brand-600" />
                ) : (
                  <Circle size={20} className="text-slate-300" />
                )}
                <span className="flex-1 text-sm font-medium text-ink">
                  {i + 1}. {tr(c)}
                </span>
                {c.current && (
                  <>
                    <Link
                      to={`/ai-tutor?prompt=${encodeURIComponent(`${t('explainPrompt')} ${tr(c)}`)}`}
                      className="hidden rounded-lg border border-brand-200 px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50 sm:block"
                    >
                      {t('continue')}
                    </Link>
                    <button
                      onClick={() =>
                        setChapterDone(s.id, c.index, true)
                          .then(() => showToast(`✅ ${tr(c)}`))
                          .catch(() => {})
                      }
                      className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-semibold text-white"
                    >
                      {t('markComplete')}
                    </button>
                  </>
                )}
                {c.done && (
                  <button
                    onClick={() => setChapterDone(s.id, c.index, false).catch(() => {})}
                    className="text-xs text-emerald-600 hover:underline"
                    title={t('markUndone')}
                  >
                    {t('done')}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-lg font-semibold text-ink">{t('homework')}</h2>
          {tasks.length === 0 && <p className="text-sm text-muted">—</p>}
          <ul className="space-y-2">
            {tasks.map((h) => (
              <li key={h.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                <span className="flex-1">
                  <span className="block text-sm font-medium text-ink">{tr(h.title)}</span>
                  <span className="block text-xs text-muted">{tr(h.detail)}</span>
                </span>
                <DuePill item={h} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
