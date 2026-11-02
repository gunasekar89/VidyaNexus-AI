import { Link } from 'react-router-dom'
import { ArrowRight, Building2, GraduationCap, Presentation } from 'lucide-react'
import { useApp } from '../AppContext'
import { Logo } from '../components/Logo'
import { LanguageToggle } from '../components/Layout'
import { Sparkle } from '../components/Illustrations'
import hero from '../assets/hero-student.png'

const CARDS = [
  { portal: 'admin', icon: Building2, title: 'cardAdminTitle', who: 'cardAdminWho', tone: 'from-brand-600 to-violet-500' },
  { portal: 'family', icon: GraduationCap, title: 'cardFamilyTitle', who: 'cardFamilyWho', tone: 'from-emerald-500 to-teal-500' },
  { portal: 'staff', icon: Presentation, title: 'cardStaffTitle', who: 'cardStaffWho', tone: 'from-orange-500 to-amber-500' },
]

// Public home page: exactly three entry cards. Choosing a card is navigation only.
export default function Home() {
  const { t } = useApp()
  return (
    <div className="min-h-screen bg-canvas">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo tagline={t('tagline')} />
        <LanguageToggle compact />
      </header>

      <section className="relative mx-auto max-w-6xl overflow-hidden rounded-none bg-gradient-to-br from-[#1d296d] via-[#3b3a9e] to-[#6457cf] px-6 pb-10 pt-10 text-white sm:rounded-3xl sm:px-12">
        <Sparkle className="absolute left-[8%] top-[18%] h-4 w-4 text-white/60" />
        <Sparkle className="absolute right-[42%] top-[30%] h-3 w-3 text-white/40" />
        <div className="relative z-10 max-w-xl">
          <h1 className="text-3xl font-bold leading-tight md:text-[40px]">{t('homeTitle')}</h1>
          <p className="mt-4 text-base text-white/85 md:text-lg">{t('homeSubtitle')}</p>
          <p className="mt-3 italic text-white/75">{t('heroQuote')}</p>
        </div>
        <img
          src={hero}
          alt=""
          className="pointer-events-none absolute bottom-0 right-0 hidden h-full w-[40%] select-none object-cover object-left-top opacity-90 md:block"
          style={{ maskImage: 'linear-gradient(to right, transparent 0, black 30%)', WebkitMaskImage: 'linear-gradient(to right, transparent 0, black 30%)' }}
          draggable="false"
        />
      </section>

      <main className="mx-auto max-w-6xl px-5 pb-12 pt-8">
        <h2 className="mb-4 text-xl font-bold text-ink">{t('chooseEntry')}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {CARDS.map(({ portal, icon: Icon, title, who, tone }) => (
            <Link
              key={portal}
              to={`/login/${portal}`}
              className="group flex flex-col rounded-3xl border border-slate-100 bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <span className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-sm ${tone}`}>
                <Icon size={28} />
              </span>
              <span className="text-lg font-bold text-ink">{t(title)}</span>
              <span className="mt-2 flex-1 text-sm leading-relaxed text-muted">{t(who)}</span>
              <span className="mt-5 inline-flex items-center gap-2 text-[15px] font-semibold text-brand-600">
                {t('signIn')} <ArrowRight size={18} className="transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
        <p className="mt-5 text-center text-xs text-muted">{t('cardNote')}</p>
      </main>
    </div>
  )
}
