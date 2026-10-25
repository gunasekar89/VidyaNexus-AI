import { Link } from 'react-router-dom'
import { ChevronRight, RotateCcw } from 'lucide-react'
import { useApp } from '../AppContext'
import { student } from '../data/mock'
import { Card, PageHeader } from '../components/ui'
import { Avatar, LanguageToggle } from '../components/Layout'
import { navItems } from '../components/nav'

export default function Profile() {
  const { t, tr, resetDemo, showToast } = useApp()
  const rows = [
    { label: t('school'), value: tr(student.school) },
    { label: t('rollNo'), value: student.rollNo },
    { label: t('guardian'), value: `${student.guardian} · ${student.phone}` },
    { label: 'Email', value: student.email },
  ]
  return (
    <div>
      <PageHeader title={t('myProfile')} />
      <Card className="mb-4 flex items-center gap-4 p-5">
        <Avatar className="h-16 w-16" />
        <div className="flex-1">
          <div className="text-xl font-bold text-ink">{student.name}</div>
          <div className="text-sm text-muted">{tr(student.className)}</div>
        </div>
      </Card>
      <Card className="mb-4 divide-y divide-slate-100">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-4 px-5 py-3.5 text-sm">
            <span className="text-muted">{r.label}</span>
            <span className="text-right font-medium text-ink">{r.value}</span>
          </div>
        ))}
        <div className="flex items-center justify-between px-5 py-3 text-sm">
          <span className="text-muted">{t('language')}</span>
          <LanguageToggle compact />
        </div>
      </Card>
      {/* On mobile, pages not in the bottom bar are reachable from here. */}
      <Card className="mb-4 divide-y divide-slate-100 lg:hidden">
        {navItems.slice(1).map(({ to, key, icon: Icon }) => (
          <Link key={to} to={to} className="flex items-center gap-3 px-5 py-3.5 text-sm text-ink">
            <Icon size={18} className="text-brand-600" />
            <span className="flex-1">{t(key)}</span>
            <ChevronRight size={16} className="text-slate-400" />
          </Link>
        ))}
      </Card>
      <button
        onClick={() => {
          resetDemo()
          showToast('Demo data reset')
        }}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-ink hover:bg-slate-50"
      >
        <RotateCcw size={16} /> Reset demo
      </button>
    </div>
  )
}
