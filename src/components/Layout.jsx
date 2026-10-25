import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, ChevronDown, LogOut, Search, Settings, UserRound } from 'lucide-react'
import { useApp } from '../AppContext'
import { Logo } from './Logo'
import { navFor } from './nav'
import SearchPalette from './SearchPalette'
import avatar from '../assets/avatar.png'
import school from '../assets/school.png'

export function Avatar({ className = 'h-11 w-11', user: who }) {
  const { user: me } = useApp()
  const user = who ?? me
  if (user?.avatar === 'ananya') return <img src={avatar} alt={user.name} className={`${className} rounded-full object-cover ring-2 ring-white`} />
  // Everyone else gets their initials.
  const initials = (user?.name ?? '?')
    .replace(/^(Mrs?|Ms|Dr)\.?\s+/i, '')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <span
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-500 text-[0.8em] font-semibold text-white ring-2 ring-white`}
      aria-label={user?.name}
    >
      {initials}
    </span>
  )
}

export function LanguageToggle({ compact }) {
  const { lang, setLang } = useApp()
  const base = compact ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-[15px]'
  return (
    <div className={`flex items-center rounded-xl border border-slate-100 bg-white ${compact ? '' : 'px-2 shadow-card'}`}>
      <button
        onClick={() => setLang('en')}
        className={`${base} font-semibold transition-colors ${lang === 'en' ? 'text-ink' : 'text-slate-400 hover:text-ink'}`}
        aria-pressed={lang === 'en'}
      >
        EN
      </button>
      <span className="h-4 w-px bg-slate-300" />
      <button
        onClick={() => setLang('kn')}
        className={`${base} font-semibold transition-colors ${lang === 'kn' ? 'text-ink' : 'text-slate-400 hover:text-ink'}`}
        aria-pressed={lang === 'kn'}
      >
        ಕನ್ನಡ
      </button>
    </div>
  )
}

function useClickOutside(ref, onOutside) {
  useEffect(() => {
    const handler = (e) => ref.current && !ref.current.contains(e.target) && onOutside()
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ref, onOutside])
}

function NotificationsMenu({ small }) {
  const { t, tr, notifications, markNotificationRead, markAllNotificationsRead } = useApp()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
  useClickOutside(ref, () => setOpen(false))
  const unread = notifications.filter((n) => !n.read).length
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`relative flex items-center justify-center rounded-full text-ink hover:bg-slate-100 ${small ? 'h-8 w-8' : 'h-11 w-11'}`}
        aria-label={t('notifications')}
      >
        <Bell size={small ? 19 : 24} strokeWidth={1.8} />
        {unread > 0 && (
          <span
            className={`absolute flex items-center justify-center rounded-full bg-rose-500 font-semibold text-white ring-2 ring-white ${small ? 'right-0.5 top-0.5 h-3.5 w-3.5 text-[8px]' : 'right-1.5 top-1 h-[18px] w-[18px] text-[10px]'}`}
          >
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-100 bg-white p-2 shadow-xl">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="font-semibold text-ink">{t('notifications')}</span>
            {unread > 0 && (
              <button onClick={markAllNotificationsRead} className="text-xs font-medium text-brand-600 hover:underline">
                {t('markAllRead')}
              </button>
            )}
          </div>
          {notifications.map((n) => (
            <button
              key={n.key}
              onClick={() => {
                markNotificationRead(n.key)
                setOpen(false)
                navigate(n.to)
              }}
              className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50"
            >
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-slate-200' : 'bg-brand-500'}`} />
              <span>
                <span className={`block text-sm ${n.read ? 'text-muted' : 'font-medium text-ink'}`}>{tr(n.text)}</span>
                <span className="text-xs text-muted">{tr(n.time)}</span>
              </span>
            </button>
          ))}
          {unread === 0 && <p className="px-3 pb-2 pt-1 text-xs text-muted">{t('noNotifications')}</p>}
        </div>
      )}
    </div>
  )
}

function ProfileMenu() {
  const { t, tr, user, logout } = useApp()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useClickOutside(ref, () => setOpen(false))
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-3 rounded-2xl py-1 pl-1 pr-2 hover:bg-white/70">
        <Avatar className="h-12 w-12" />
        <div className="text-left leading-tight">
          <div className="text-[15px] font-semibold text-ink">{user.name}</div>
          <div className="text-[13px] text-muted">{user.role === 'teacher' ? t('teacherRole') : tr(user.className)}</div>
        </div>
        <ChevronDown size={18} className="ml-3 text-slate-500" />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-56 rounded-2xl border border-slate-100 bg-white p-2 shadow-xl">
          <Link to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-ink hover:bg-slate-50">
            <UserRound size={16} /> {t('myProfile')}
          </Link>
          <Link to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-ink hover:bg-slate-50">
            <Settings size={16} /> {t('settings')}
          </Link>
          <button
            onClick={() => {
              setOpen(false)
              logout()
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-rose-500 hover:bg-rose-50"
          >
            <LogOut size={16} /> {t('logout')}
          </button>
        </div>
      )}
    </div>
  )
}

function Sidebar() {
  const { t, homework, user } = useApp()
  const pendingHomework = homework.filter((h) => !h.done && !h.project && h.due !== 'overdue').length
  const { navItems } = navFor(user.role)
  return (
    <aside className="sticky top-3 hidden h-[calc(100vh-1.5rem)] w-[236px] shrink-0 flex-col overflow-hidden rounded-3xl bg-white shadow-card lg:flex">
      <div className="px-6 pb-6 pt-5">
        <Link to="/">
          <Logo tagline={t('tagline')} />
        </Link>
      </div>
      <nav className="flex flex-col gap-1 px-3">
        {navItems.map(({ to, key, icon: Icon, end, badge, accent }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-4 rounded-xl px-4 py-[11px] text-[15px] transition-colors ${
                isActive ? 'bg-brand-50 font-semibold text-brand-700' : 'text-ink hover:bg-slate-50'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2.2 : 1.7}
                  className={isActive ? 'text-brand-600' : accent ? 'text-violet-600' : 'text-slate-700'}
                  fill={isActive && key === 'dashboard' ? 'currentColor' : 'none'}
                />
                <span className="flex-1">{t(key)}</span>
                {badge && pendingHomework > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold text-white">
                    {pendingHomework}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto">
        <img src={school} alt="" className="w-full select-none" draggable="false" />
        <div className="bg-white px-11 pb-7 pt-4">
          <p className="whitespace-pre-line text-[14px] leading-snug text-ink">{t('brighterFutures')}</p>
          <p className="text-[14px] leading-snug text-ink">{t('smarterBengaluru')}</p>
          <div className="mt-3 h-[3px] w-10 rounded-full bg-brand-600" />
        </div>
      </div>
    </aside>
  )
}

function Topbar({ onSearch }) {
  const { t, user } = useApp()
  const student = user.role === 'student'
  return (
    <header className="hidden items-center gap-4 pb-4 lg:flex">
      <button
        onClick={onSearch}
        disabled={!student}
        className="flex h-[46px] w-full max-w-[530px] disabled:invisible items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 text-left text-[14px] text-muted shadow-card hover:border-brand-200"
      >
        <Search size={20} className="text-slate-500" />
        <span className="flex-1 truncate">{t('searchPlaceholder')}</span>
        <kbd className="rounded-md bg-slate-100 px-1.5 py-0.5 font-sans text-xs text-slate-500">⌘ K</kbd>
      </button>
      <div className="ml-auto flex items-center gap-5">
        <LanguageToggle />
        {student && <NotificationsMenu />}
        <ProfileMenu />
      </div>
    </header>
  )
}

function MobileHeader({ onSearch }) {
  const { user } = useApp()
  const student = user.role === 'student'
  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 bg-canvas/90 px-4 pb-2 pt-3 backdrop-blur lg:hidden">
      <Link to="/">
        <Logo compact />
      </Link>
      <div className="ml-auto flex items-center gap-1.5">
        {student && (
          <button onClick={onSearch} className="flex h-8 w-8 items-center justify-center rounded-full text-ink hover:bg-slate-100" aria-label="Search">
            <Search size={18} />
          </button>
        )}
        <LanguageToggle compact />
        {student && <NotificationsMenu small />}
        <Link to="/profile">
          <Avatar className="h-8 w-8" />
        </Link>
      </div>
    </header>
  )
}

function BottomNav() {
  const { t, user } = useApp()
  const { bottomNavItems } = navFor(user.role)
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {bottomNavItems.map(({ to, key, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] ${isActive ? 'font-semibold text-brand-600' : 'text-slate-500'}`
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={20} strokeWidth={isActive ? 2.2 : 1.7} fill={isActive && key === 'home' ? 'currentColor' : 'none'} />
              {t(key)}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export default function Layout() {
  const [searchOpen, setSearchOpen] = useState(false)
  const { toast, user, data } = useApp()
  const location = useLocation()

  useEffect(() => {
    if (user.role !== 'student') return
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [user.role])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <div className="min-h-screen bg-canvas">
      <MobileHeader onSearch={() => setSearchOpen(true)} />
      <div className="mx-auto flex max-w-[1680px] gap-5 lg:p-3 lg:pr-6">
        <Sidebar />
        <main className="min-w-0 flex-1 px-4 pb-24 pt-2 lg:px-0 lg:pb-6 lg:pt-1">
          <Topbar onSearch={() => setSearchOpen(true)} />
          <Outlet />
        </main>
      </div>
      <BottomNav />
      {data && <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />}
      {toast && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white shadow-xl lg:bottom-8">
          {toast}
        </div>
      )}
    </div>
  )
}
