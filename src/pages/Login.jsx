import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, LogIn } from 'lucide-react'
import { useApp } from '../AppContext'
import { api } from '../api'
import AuthShell, { FieldError, inputClass, primaryButton } from '../components/AuthShell'

const PORTALS = ['admin', 'family', 'staff']
// Emails and mobile numbers identify an account on their own; IDs need the school code.
const needsInstitution = (v) => v.trim() !== '' && !v.includes('@') && v.replace(/\D/g, '').length < 10

export default function Login() {
  const { portal } = useParams()
  const { t, login, errorText } = useApp()
  const [identifier, setIdentifier] = useState('')
  const [institution, setInstitution] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [demo, setDemo] = useState({ accounts: [] })

  useEffect(() => {
    if (!PORTALS.includes(portal)) return
    const load = () =>
      api(`/auth/demo?portal=${portal}`)
        .then(setDemo)
        .catch(() => {})
    load()
    // Demo 2-step codes change every 30 seconds.
    const timer = window.setInterval(load, 15_000)
    return () => window.clearInterval(timer)
  }, [portal])

  if (!PORTALS.includes(portal)) return <Navigate to="/" replace />

  const showInstitution = needsInstitution(identifier)
  const submit = async (e) => {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(identifier.trim(), password, { portal, institution: showInstitution ? institution.trim() : undefined })
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <AuthShell>
      <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
        <ArrowLeft size={16} /> {t('allSignInOptions')}
      </Link>
      <h2 className="text-2xl font-bold text-ink md:text-[28px]">{t(`signInAs_${portal}`)}</h2>
      <p className="mt-1 text-sm text-muted">{t('welcomeBack')}</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">{t(`identifier_${portal}`)}</span>
          <input autoComplete="username" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} className={inputClass} />
        </label>
        {showInstitution && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{t('institutionCode')}</span>
            <input required value={institution} onChange={(e) => setInstitution(e.target.value)} className={`${inputClass} uppercase`} autoCapitalize="characters" />
            <span className="mt-1 block text-xs text-muted">{t('institutionHint')}</span>
          </label>
        )}
        <label className="block">
          <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-ink">
            {t('password')}
            <Link to="/recover" className="text-xs font-medium text-brand-600 hover:underline">
              {t('forgotPassword')}
            </Link>
          </span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </label>
        <FieldError>{error}</FieldError>
        <button disabled={busy} className={primaryButton}>
          {busy ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />} {t('login')}
        </button>
      </form>

      {demo.accounts.length > 0 && (
        <div className="mt-8 rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{t('demoAccounts')}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {demo.accounts.map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => {
                  setIdentifier(d.employeeId ?? d.email)
                  setInstitution(d.employeeId ? demo.institution : '')
                  setPassword(d.password)
                }}
                className="rounded-xl border border-slate-100 px-3 py-2.5 text-left hover:border-brand-200 hover:bg-brand-50"
              >
                <span className="block text-sm font-semibold text-ink">{t(`demo_${d.key}`)}</span>
                <span className="block truncate text-xs text-muted">{d.employeeId ? `${d.employeeId} · ${t('demoInstitution')} ${demo.institution}` : d.email}</span>
                <span className="block text-xs text-muted">{d.password}</span>
                {d.mfaCode && (
                  <span className="mt-1 inline-block rounded-md bg-violet-50 px-1.5 py-0.5 font-mono text-xs text-violet-700">
                    {t('demoMfa')}: {d.mfaCode}
                  </span>
                )}
              </button>
            ))}
          </div>
          {demo.accounts.some((d) => d.mfaCode) && <p className="mt-3 text-xs text-muted">{t('demoMfaNote')}</p>}
        </div>
      )}
    </AuthShell>
  )
}
