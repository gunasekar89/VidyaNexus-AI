import { useEffect, useState } from 'react'
import { Loader2, LogIn } from 'lucide-react'
import { useApp } from '../AppContext'
import { api } from '../api'
import { Logo } from '../components/Logo'
import { LanguageToggle } from '../components/Layout'
import { Sparkle } from '../components/Illustrations'
import hero from '../assets/hero-student.png'


export default function Login() {
  const { t, login, errorText } = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  // The server lists the demo accounts while they still use their default passwords.
  const [demoLogins, setDemoLogins] = useState([])
  useEffect(() => {
    api('/auth/demo')
      .then((res) => setDemoLogins(res.accounts))
      .catch(() => {})
  }, [])

  const submit = async (e) => {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email.trim(), password)
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  const input = 'h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-[15px] text-ink outline-none focus:border-brand-500 focus:bg-white'

  return (
    <div className="flex min-h-screen bg-canvas">
      <section className="relative hidden w-[46%] overflow-hidden bg-gradient-to-br from-[#1d296d] via-[#3b3a9e] to-[#6457cf] text-white lg:block">
        <Sparkle className="absolute left-[18%] top-[22%] h-4 w-4 text-white/70" />
        <Sparkle className="absolute right-[20%] top-[34%] h-3 w-3 text-white/50" />
        <div className="relative z-10 max-w-md px-12 pt-16">
          <h1 className="text-4xl font-bold leading-tight">{t('loginHeroTitle')}</h1>
          <p className="mt-4 text-lg text-white/85">{t('heroLine')}</p>
          <p className="mt-4 italic text-white/80">{t('heroQuote')}</p>
        </div>
        <img
          src={hero}
          alt=""
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[50%] w-full select-none object-cover object-top"
          style={{ maskImage: 'linear-gradient(to bottom, transparent 0, black 22%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, black 22%)' }}
          draggable="false"
        />
      </section>

      <main className="flex flex-1 flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Logo tagline={t('tagline')} />
          <LanguageToggle compact />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <h2 className="text-2xl font-bold text-ink md:text-[28px]">{t('welcomeBack')}</h2>
          <p className="mt-1 text-sm text-muted">{t('loginSubtitle')}</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">{t('email')}</span>
              <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">{t('password')}</span>
              <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
            </label>
            {error && <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-600">{error}</p>}
            <button
              disabled={busy}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-[15px] font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />} {t('login')}
            </button>
          </form>

          {demoLogins.length > 0 && (
            <div className="mt-8 rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{t('demoAccounts')}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {demoLogins.map((d) => (
                  <button
                    key={d.role}
                    type="button"
                    onClick={() => {
                      setEmail(d.email)
                      setPassword(d.password)
                    }}
                    className="rounded-xl border border-slate-100 px-3 py-2.5 text-left hover:border-brand-200 hover:bg-brand-50"
                  >
                    <span className="block text-sm font-semibold text-ink">{t(d.role === 'teacher' ? 'demoTeacher' : 'demoStudent')}</span>
                    <span className="block truncate text-xs text-muted">{d.email}</span>
                    <span className="block text-xs text-muted">{d.password}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
