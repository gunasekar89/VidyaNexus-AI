import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useApp } from '../../AppContext'
import { navFor } from '../../components/nav'
import { Card, PageHeader } from '../../components/ui'

const SECTION_LABEL = { school: 'navSchool', office: 'navOffice', me: 'navForMe' }

// Everything this workspace can open, for phones (the bottom bar holds four).
export default function Menu() {
  const { t, user, workspace } = useApp()
  const { navItems } = navFor(user.role, workspace, workspace?.permissions)
  const groups = []
  for (const item of navItems) {
    const key = item.section ?? 'main'
    let g = groups.find((x) => x.key === key)
    if (!g) groups.push((g = { key, items: [] }))
    g.items.push(item)
  }
  return (
    <div className="max-w-2xl">
      <PageHeader title={t('more')} subtitle={t('menuSub')} />
      <div className="space-y-5">
        {groups.map((g) => (
          <section key={g.key}>
            {SECTION_LABEL[g.key] && <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{t(SECTION_LABEL[g.key])}</h2>}
            <Card className="divide-y divide-slate-100 overflow-hidden">
              {g.items.map(({ to, key, icon: Icon }) => (
                <Link key={to} to={to} className="flex items-center gap-3 px-5 py-3.5 text-sm font-medium text-ink hover:bg-slate-50">
                  <Icon size={19} className="text-brand-600" />
                  <span className="flex-1">{t(key)}</span>
                  <ChevronRight size={16} className="text-slate-400" />
                </Link>
              ))}
            </Card>
          </section>
        ))}
      </div>
    </div>
  )
}
