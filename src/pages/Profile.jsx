import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, KeyRound, LogOut } from 'lucide-react'
import { useApp } from '../AppContext'
import { api } from '../api'
import { Card, PageHeader } from '../components/ui'
import { Avatar, LanguageToggle } from '../components/Layout'
import { navFor } from '../components/nav'

function PasswordForm() {
  const { t, showToast, errorText } = useApp()
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (form.next !== form.confirm) return setError(t('passwordsDontMatch'))
    setSaving(true)
    setError(null)
    try {
      await api('/me/password', { method: 'POST', body: { current: form.current, next: form.next } })
      setForm({ current: '', next: '', confirm: '' })
      showToast(t('passwordChanged'))
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  const input = 'h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-brand-500 focus:bg-white'
  return (
    <Card className="mb-4 p-5">
      <h2 className="mb-3 flex items-center gap-2 font-semibold text-ink">
        <KeyRound size={18} className="text-brand-600" /> {t('changePassword')}
      </h2>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
        <input type="password" autoComplete="current-password" required value={form.current} onChange={set('current')} placeholder={t('currentPassword')} className={input} />
        <input type="password" autoComplete="new-password" required minLength={8} value={form.next} onChange={set('next')} placeholder={t('newPassword')} className={input} />
        <input type="password" autoComplete="new-password" required value={form.confirm} onChange={set('confirm')} placeholder={t('confirmPassword')} className={input} />
        {error && <p className="text-sm text-rose-600 sm:col-span-3">{error}</p>}
        <button disabled={saving} className="h-11 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 sm:col-start-3">
          {t('save')}
        </button>
      </form>
    </Card>
  )
}

export default function Profile() {
  const { t, tr, user, logout } = useApp()
  const student = user.role === 'student'
  const rows = [
    { label: t('school'), value: tr(user.school) },
    ...(student
      ? [
          { label: t('rollNo'), value: user.rollNo || '—' },
          { label: t('guardian'), value: [user.guardian, user.phone].filter(Boolean).join(' · ') || '—' },
        ]
      : [{ label: t('phone'), value: user.phone || '—' }]),
    { label: t('email'), value: user.email },
  ]
  return (
    <div>
      <PageHeader title={t('myProfile')} />
      <Card className="mb-4 flex items-center gap-4 p-5">
        <Avatar className="h-16 w-16 text-2xl" />
        <div className="flex-1">
          <div className="text-xl font-bold text-ink">{user.name}</div>
          <div className="text-sm text-muted">{student ? tr(user.className) : t('teacherRole')}</div>
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
      {student && (
        <Card className="mb-4 divide-y divide-slate-100 lg:hidden">
          {navFor('student')
            .navItems.slice(1)
            .map(({ to, key, icon: Icon }) => (
              <Link key={to} to={to} className="flex items-center gap-3 px-5 py-3.5 text-sm text-ink">
                <Icon size={18} className="text-brand-600" />
                <span className="flex-1">{t(key)}</span>
                <ChevronRight size={16} className="text-slate-400" />
              </Link>
            ))}
        </Card>
      )}
      <PasswordForm />
      <button
        onClick={logout}
        className="flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50"
      >
        <LogOut size={16} /> {t('logout')}
      </button>
    </div>
  )
}
