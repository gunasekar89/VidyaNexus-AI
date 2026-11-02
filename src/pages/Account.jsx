import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react'
import { useApp } from '../AppContext'
import { api } from '../api'
import AuthShell, { FieldError, fill, inputClass, primaryButton } from '../components/AuthShell'

function Back() {
  const { t } = useApp()
  return (
    <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
      <ArrowLeft size={16} /> {t('allSignInOptions')}
    </Link>
  )
}

export function Recover() {
  const { t, errorText } = useApp()
  const [identifier, setIdentifier] = useState('')
  const [institution, setInstitution] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    try {
      await api('/auth/recover', { method: 'POST', body: { identifier, institution } })
      setSent(true)
    } catch (err) {
      setError(errorText(err))
    }
  }
  return (
    <AuthShell>
      <Back />
      <h2 className="text-2xl font-bold text-ink">{t('recoverTitle')}</h2>
      <p className="mb-5 mt-1 text-sm text-muted">{t('recoverBody')}</p>
      {sent ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{t('recoverSent')}</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <input required value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder={t('identifier_family')} className={inputClass} />
          <input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder={t('institutionCode')} className={inputClass} />
          <FieldError>{error}</FieldError>
          <button className={primaryButton}>{t('sendResetLink')}</button>
        </form>
      )}
    </AuthShell>
  )
}

export function Reset() {
  const { token } = useParams()
  const { t, errorText } = useApp()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    if (password !== confirm) return setError(t('passwordsDontMatch'))
    try {
      await api('/auth/reset', { method: 'POST', body: { token, password } })
      setDone(true)
    } catch (err) {
      setError(errorText(err))
    }
  }
  return (
    <AuthShell>
      <Back />
      <h2 className="mb-5 text-2xl font-bold text-ink">{t('resetTitle')}</h2>
      {done ? (
        <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={18} /> {t('resetDone')}
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('newPassword')} className={inputClass} />
          <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={t('confirmPassword')} className={inputClass} />
          <FieldError>{error}</FieldError>
          <button className={primaryButton}>{t('savePassword')}</button>
        </form>
      )}
    </AuthShell>
  )
}

export function Invite() {
  const { token } = useParams()
  const { t, tr, errorText, reloadSession } = useApp()
  const navigate = useNavigate()
  const [invite, setInvite] = useState(undefined)
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api(`/invitations/${token}`)
      .then(setInvite)
      .catch(() => setInvite(null))
  }, [token])
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api(`/invitations/${token}/accept`, { method: 'POST', body: { password } })
      await reloadSession()
      navigate('/')
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }
  return (
    <AuthShell>
      <h2 className="text-2xl font-bold text-ink">{t('inviteTitle')}</h2>
      {invite === undefined && <Loader2 className="mt-6 animate-spin text-brand-600" />}
      {invite === null && (
        <>
          <p className="mb-5 mt-2 text-sm text-muted">{t('inviteInvalid')}</p>
          <Link to="/" className={primaryButton}>
            {t('goToSignIn')}
          </Link>
        </>
      )}
      {invite && (
        <>
          <p className="mb-1 mt-2 text-sm text-ink">{fill(t('inviteBody'), { school: tr(invite.school), name: invite.name, role: tr(invite.roleLabel) })}</p>
          <p className="mb-5 text-sm text-muted">{invite.email}</p>
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">{invite.existingAccount ? t('inviteExisting') : t('inviteNew')}</span>
              <input type="password" autoComplete={invite.existingAccount ? 'current-password' : 'new-password'} required minLength={invite.existingAccount ? 1 : 8} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
            </label>
            <FieldError>{error}</FieldError>
            <button disabled={busy} className={primaryButton}>
              {busy && <Loader2 size={18} className="animate-spin" />} {t('acceptInvite')}
            </button>
          </form>
        </>
      )}
    </AuthShell>
  )
}
