import { Link } from 'react-router-dom'
import { useApp } from '../AppContext'
import { Logo } from './Logo'
import { LanguageToggle } from './Layout'
import { Sparkle } from './Illustrations'
import hero from '../assets/hero-student.png'

export const inputClass =
  'h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-[15px] text-ink outline-none focus:border-brand-500 focus:bg-white'
export const primaryButton =
  'flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-[15px] font-semibold text-white hover:bg-brand-700 disabled:opacity-60'

// The two-panel layout used by every signed-out screen.
export default function AuthShell({ children, title }) {
  const { t } = useApp()
  return (
    <div className="flex min-h-screen bg-canvas">
      <section className="relative hidden w-[46%] overflow-hidden bg-gradient-to-br from-[#1d296d] via-[#3b3a9e] to-[#6457cf] text-white lg:block">
        <Sparkle className="absolute left-[18%] top-[22%] h-4 w-4 text-white/70" />
        <Sparkle className="absolute right-[20%] top-[34%] h-3 w-3 text-white/50" />
        <div className="relative z-10 max-w-md px-12 pt-16">
          <h1 className="text-4xl font-bold leading-tight">{title ?? t('loginHeroTitle')}</h1>
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
          <Link to="/">
            <Logo tagline={t('tagline')} />
          </Link>
          <LanguageToggle compact />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">{children}</div>
      </main>
    </div>
  )
}

export function FieldError({ children }) {
  if (!children) return null
  return (
    <p role="alert" className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-600">
      {children}
    </p>
  )
}

// Replaces {name} placeholders in a translated string.
export const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '')
