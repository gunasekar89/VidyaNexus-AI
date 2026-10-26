import { useApp } from '../AppContext'
import { badges } from '../../shared/catalog'

// The catalogue badges, coloured when earned and greyed out with a hint when not.
export default function BadgeGrid({ earned }) {
  const { t, tr } = useApp()
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {badges.map((b) => (
        <div
          key={b.id}
          className={`flex flex-col items-center gap-2 rounded-2xl p-4 text-center ${earned[b.id] ? 'bg-gradient-to-br from-brand-50 to-violet-50' : 'bg-slate-50 opacity-60 grayscale'}`}
        >
          <span className="text-3xl">{b.icon}</span>
          <span className="text-sm font-medium text-ink">{tr(b.label)}</span>
          <span className="text-[11px] text-muted">{earned[b.id] ? t('earned') : tr(b.hint)}</span>
        </div>
      ))}
    </div>
  )
}
