import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Check, GraduationCap, KeyRound, Loader2, LogOut, Presentation, ShieldCheck, Users, Wrench } from 'lucide-react'
import { useApp } from '../AppContext'
import { api } from '../api'
import AuthShell, { FieldError, inputClass } from '../components/AuthShell'
import { Card, PageHeader } from '../components/ui'

const KIND_ICONS = { admin: Building2, learner: GraduationCap, guardian: Users, teacher: Presentation, worker: Wrench }

// First-time 2-step setup: shows a QR code, then checks one code.
function MfaSetup({ onDone, onCancel }) {
  const { t, errorText } = useApp()
  const [setup, setSetup] = useState(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api('/mfa/setup', { method: 'POST' })
      .then(setSetup)
      .catch((err) => setError(errorText(err)))
  }, [errorText])
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/mfa/enable', { method: 'POST', body: { code } })
      await onDone()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }
  return (
    <div className="mt-3 rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
      <h3 className="flex items-center gap-2 font-semibold text-ink">
        <ShieldCheck size={18} className="text-violet-600" /> {t('mfaSetupTitle')}
      </h3>
      <p className="mt-1 text-sm text-muted">{t('mfaSetupBody')}</p>
      {setup && (
        <>
          <div className="mx-auto mt-3 w-44 rounded-xl bg-white p-2" dangerouslySetInnerHTML={{ __html: setup.qr }} />
          <p className="mt-2 text-xs text-muted">{t('mfaManual')}</p>
          <p className="break-all font-mono text-sm text-ink">{setup.secret.match(/.{1,4}/g).join(' ')}</p>
        </>
      )}
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" aria-label={t('mfaCodeLabel')} className={`${inputClass} h-11 tracking-widest`} />
        <button disabled={busy || !setup} className="rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
          {busy ? <Loader2 size={16} className="animate-spin" /> : t('mfaEnable')}
        </button>
      </form>
      <FieldError>{error}</FieldError>
      <button type="button" onClick={onCancel} className="mt-2 text-xs text-muted hover:underline">
        {t('cancel')}
      </button>
    </div>
  )
}

function WorkspaceRow({ w, current, demoCode, onOpened }) {
  const { t, tr, switchWorkspace, errorText } = useApp()
  const [code, setCode] = useState('')
  const [needCode, setNeedCode] = useState(false)
  const [needSetup, setNeedSetup] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const Icon = KIND_ICONS[w.kind] ?? Users

  const open = async (e) => {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await switchWorkspace(w.id, code || undefined)
      onOpened()
    } catch (err) {
      if (err.code === 'mfa.required') setNeedCode(true)
      else if (err.code === 'mfa.setup_required') setNeedSetup(true)
      else setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <li className="rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Icon size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{tr(w.roleLabel)}</p>
          <p className="truncate text-sm text-muted">{w.school ? tr(w.school.name) : w.group?.name}</p>
          {w.privileged && !current && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-violet-600">
              <KeyRound size={12} /> {t('needsCode')}
            </p>
          )}
        </div>
        {current ? (
          <span className="flex items-center gap-1 text-sm font-medium text-emerald-600">
            <Check size={16} /> {t('currentWorkspace')}
          </span>
        ) : (
          !needCode &&
          !needSetup && (
            <button onClick={open} disabled={busy} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
              {busy ? <Loader2 size={16} className="animate-spin" /> : t('open')}
            </button>
          )
        )}
      </div>
      {needCode && (
        <form onSubmit={open} className="mt-3">
          <label className="mb-1.5 block text-sm font-medium text-ink">{t('mfaCodeLabel')}</label>
          <div className="flex gap-2">
            <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} className={`${inputClass} h-11 tracking-widest`} />
            <button disabled={busy} className="rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
              {busy ? <Loader2 size={16} className="animate-spin" /> : t('verify')}
            </button>
          </div>
          {demoCode && (
            <p className="mt-1.5 text-xs text-violet-700">
              {t('demoMfa')}: <span className="font-mono">{demoCode}</span>
            </p>
          )}
        </form>
      )}
      {needSetup && (
        <MfaSetup
          onCancel={() => setNeedSetup(false)}
          onDone={async () => {
            await switchWorkspace(w.id)
            onOpened()
          }}
        />
      )}
      {error && <div className="mt-3">{<FieldError>{error}</FieldError>}</div>}
    </li>
  )
}

function useDemoCode(email) {
  const [code, setCode] = useState(null)
  useEffect(() => {
    const load = () =>
      api('/auth/demo')
        .then((r) => setCode(r.accounts.find((a) => a.email === email)?.mfaCode ?? null))
        .catch(() => {})
    load()
    const timer = window.setInterval(load, 15_000)
    return () => window.clearInterval(timer)
  }, [email])
  return code
}

export function WorkspaceList({ onOpened = () => {} }) {
  const { workspaces, workspace, portal, user } = useApp()
  const demoCode = useDemoCode(user.email)
  // Workspaces for the chosen entry card first.
  const sorted = [...workspaces].sort((a, b) => Number(b.cards.includes(portal)) - Number(a.cards.includes(portal)))
  return (
    <ul className="space-y-3">
      {sorted.map((w) => (
        <WorkspaceRow key={w.id} w={w} current={workspace?.id === w.id} demoCode={demoCode} onOpened={onOpened} />
      ))}
    </ul>
  )
}

// Shown after sign-in when no workspace opened automatically.
export function WorkspaceGate() {
  const { t, workspaces, portal, logout } = useApp()
  const noneForCard = portal && workspaces.length > 0 && !workspaces.some((w) => w.cards.includes(portal))
  return (
    <AuthShell>
      <h2 className="text-2xl font-bold text-ink">{t('chooseWorkspace')}</h2>
      <p className="mb-5 mt-1 text-sm text-muted">
        {!workspaces.length ? t('noWorkspaces') : noneForCard ? t('noWorkspaceForCard') : workspaces.length > 1 ? t('chooseWorkspaceSub') : t('openWorkspaceSub')}
      </p>
      <WorkspaceList />
      <button onClick={logout} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-[15px] font-semibold text-ink ring-1 ring-slate-200 hover:bg-slate-50">
        <LogOut size={18} /> {t('logout')}
      </button>
    </AuthShell>
  )
}

// In-app page for switching between roles.
export default function WorkspacesPage() {
  const { t } = useApp()
  const navigate = useNavigate()
  return (
    <div className="max-w-2xl">
      <PageHeader title={t('switchWorkspace')} subtitle={t('chooseWorkspaceSub')} />
      <Card className="p-4">
        <WorkspaceList onOpened={() => navigate('/')} />
      </Card>
    </div>
  )
}
