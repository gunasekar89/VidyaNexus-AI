import { Link } from 'react-router-dom'
import { useApp } from '../AppContext'
import { subjects } from '../data/mock'
import { Card, PageHeader, ProgressBar, SubjectIcon } from '../components/ui'

export default function Subjects() {
  const { t, tr } = useApp()
  return (
    <div>
      <PageHeader title={t('subjects')} subtitle={t('continueLearning')} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {subjects.map((s) => {
          const done = s.chapters.filter((c) => c.done).length
          return (
            <Link key={s.id} to={`/subjects/${s.id}`}>
              <Card className="h-full p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="flex items-start gap-4">
                  <SubjectIcon subject={s} size="lg" />
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-ink">{tr(s.name)}</h2>
                    <p className="text-sm text-muted">{tr(s.topic)}</p>
                    <p className="mt-1 text-xs text-muted">
                      {t('teacher')}: {s.teacher}
                    </p>
                  </div>
                </div>
                <div className="mt-5 flex items-center gap-3">
                  <ProgressBar value={s.progress} />
                  <span className="text-sm font-medium text-ink">{s.progress}%</span>
                </div>
                <p className="mt-2 text-xs text-muted">
                  {done}/{s.chapters.length} {t('chapters')}
                </p>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
