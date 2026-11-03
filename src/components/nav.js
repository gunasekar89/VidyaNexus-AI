import {
  BarChart3,
  BookOpen,
  Building2,
  Bus,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  DoorOpen,
  FileText,
  GraduationCap,
  HeartPulse,
  Home,
  IndianRupee,
  Inbox,
  Landmark,
  LayoutDashboard,
  LayoutGrid,
  Library,
  LifeBuoy,
  Megaphone,
  Network,
  ReceiptText,
  Route,
  School,
  ScrollText,
  Send,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Stethoscope,
  Trophy,
  UserPlus,
  UserRound,
  Users,
  UsersRound,
  Wallet,
} from 'lucide-react'

export const navItems = [
  { to: '/', key: 'dashboard', icon: Home, end: true },
  { to: '/calendar', key: 'smartCalendar', icon: CalendarDays },
  { to: '/subjects', key: 'subjects', icon: BookOpen },
  { to: '/ai-tutor', key: 'aiTutor', icon: Sparkles, accent: true },
  { to: '/homework', key: 'homework', icon: FileText, badge: true },
  { to: '/tests', key: 'testsExams', icon: ClipboardList },
  { to: '/attendance', key: 'attendance', icon: Users },
  { to: '/announcements', key: 'announcements', icon: Megaphone },
  { to: '/progress', key: 'progress', icon: BarChart3 },
  { to: '/awards', key: 'awards', icon: Trophy },
]

export const bottomNavItems = [
  { to: '/', key: 'home', icon: Home, end: true },
  { to: '/subjects', key: 'subjects', icon: BookOpen },
  { to: '/ai-tutor', key: 'aiTutor', icon: Sparkles },
  { to: '/homework', key: 'tasks', icon: ClipboardList },
  { to: '/profile', key: 'profile', icon: UserRound },
]

// Teachers get the Teacher Desk instead of the student pages.
const teacherNav = [
  { to: '/', key: 'teacherDesk', icon: School, end: true },
  { to: '/announcements', key: 'announcements', icon: Megaphone },
  { to: '/my-work', key: 'myWork', icon: Building2 },
]

// Admin pages appear only when the active workspace has the permission behind
// them; the server enforces the same rules on every request.
const adminNav = [
  { to: '/', key: 'adminOverview', icon: LayoutDashboard, end: true, perm: 'school.view' },
  { to: '/group', key: 'groupOverview', icon: Network, perm: 'group.view' },
  { to: '/people', key: 'people', icon: UsersRound, perm: 'members.view' },
  { to: '/students', key: 'studentsNav', icon: GraduationCap, perm: 'students.view' },
  { to: '/staff', key: 'staffNav', icon: Users, perm: 'staff.view' },
  { to: '/setup', key: 'schoolSetup', icon: Settings2, perm: 'school.view', school: true },
  { to: '/audit', key: 'auditLog', icon: ScrollText, perm: 'audit.view', school: true },
]

// School operations. A workspace sees a page when it holds any of `perms`.
// section: 'office' for desk work, 'me' for what every employee has.
export const opsPages = [
  { to: '/admissions', key: 'nav_admissions', icon: UserPlus, perms: ['admissions.manage'], section: 'office' },
  { to: '/fees', key: 'nav_fees', icon: IndianRupee, perms: ['fees.view'], section: 'office' },
  { to: '/accounts', key: 'nav_accounts', icon: Landmark, perms: ['accounts.view'], section: 'office' },
  { to: '/payroll', key: 'nav_payroll', icon: Wallet, perms: ['payroll.prepare', 'payroll.approve'], section: 'office' },
  { to: '/leave-approvals', key: 'nav_leaveApprovals', icon: CalendarCheck, perms: ['leave.approve'], section: 'office' },
  { to: '/purchasing', key: 'nav_purchasing', icon: ShoppingCart, perms: ['procurement.request', 'procurement.approve', 'procurement.manage', 'stores.manage', 'assets.manage'], section: 'office' },
  { to: '/transport', key: 'nav_transport', icon: Bus, perms: ['transport.manage'], section: 'office' },
  { to: '/trips', key: 'nav_trips', icon: Route, perms: ['transport.operate'], section: 'office' },
  { to: '/library', key: 'nav_library', icon: Library, perms: ['library.manage'], section: 'office' },
  { to: '/reception', key: 'nav_reception', icon: DoorOpen, perms: ['visitors.manage'], section: 'office' },
  { to: '/infirmary', key: 'nav_infirmary', icon: Stethoscope, perms: ['health.view'], section: 'office' },
  { to: '/safeguarding', key: 'nav_safeguarding', icon: ShieldCheck, perms: ['safeguarding.view'], section: 'office' },
  { to: '/messages', key: 'nav_messages', icon: Send, perms: ['messages.send', 'messages.approve'], section: 'office' },
  { to: '/inbox', key: 'nav_inbox', icon: Inbox, section: 'me', inbox: true },
  { to: '/helpdesk', key: 'nav_helpdesk', icon: LifeBuoy, perms: ['helpdesk.raise', 'helpdesk.manage'], section: 'me' },
  { to: '/leave', key: 'nav_myLeave', icon: CalendarClock, perms: ['self.service'], section: 'me' },
  { to: '/payslips', key: 'nav_payslips', icon: ReceiptText, perms: ['self.service'], section: 'me' },
  { to: '/report-concern', key: 'nav_reportConcern', icon: ShieldAlert, perms: ['safeguarding.report'], section: 'me' },
]

const guardianNav = [
  { to: '/', key: 'familyHome', icon: Home, end: true },
  { to: '/fees', key: 'nav_fees', icon: IndianRupee },
  { to: '/transport', key: 'nav_transport', icon: Bus },
  { to: '/library', key: 'nav_library', icon: Library },
  { to: '/health', key: 'nav_health', icon: HeartPulse },
  { to: '/inbox', key: 'nav_inbox', icon: Inbox, inbox: true },
  { to: '/helpdesk', key: 'nav_helpdesk', icon: LifeBuoy },
]

const staffNav = [{ to: '/', key: 'myWork', icon: Building2, end: true }]
const profile = { to: '/profile', key: 'profile', icon: UserRound, section: 'me' }
const more = { to: '/menu', key: 'more', icon: LayoutGrid }

export function adminNavFor(workspace, perms = []) {
  const has = new Set(perms)
  const groupLevel = !workspace?.school
  return adminNav
    .filter((i) => (!i.perm || has.has(i.perm)) && !(groupLevel && (i.school || (i.perm && i.perm !== 'group.view'))))
    .map((i) => ({ ...i, section: 'school' }))
}

// Operations pages this workspace may open (none at group level).
export function opsNavFor(workspace, perms = []) {
  const has = new Set(perms)
  if (!workspace?.school) return opsPages.filter((p) => p.inbox)
  return opsPages.filter((p) => !p.perms || p.perms.some((x) => has.has(x)))
}

// Phones get four shortcuts and a "More" page with everything else.
function bottomOf(items, picks) {
  const chosen = picks.map((to) => items.find((i) => i.to === to)).filter(Boolean)
  for (const i of items) if (chosen.length < 4 && !chosen.includes(i) && i !== profile) chosen.push(i)
  return [...chosen.slice(0, 4), more]
}

export function navFor(role, workspace, perms) {
  if (role === 'teacher') {
    const items = [...teacherNav, ...opsNavFor(workspace, perms), profile]
    return { navItems: items, bottomNavItems: bottomOf(items, ['/', '/announcements', '/my-work', '/inbox']) }
  }
  if (role === 'admin') {
    const items = [...adminNavFor(workspace, perms), ...opsNavFor(workspace, perms), profile]
    return { navItems: items, bottomNavItems: bottomOf(items, ['/', '/inbox']) }
  }
  if (role === 'guardian') {
    const items = [...guardianNav, profile]
    return { navItems: items, bottomNavItems: bottomOf(items, ['/', '/fees', '/transport', '/inbox']) }
  }
  if (role === 'staff') {
    const items = [...staffNav, ...opsNavFor(workspace, perms), profile]
    return { navItems: items, bottomNavItems: bottomOf(items, ['/', '/inbox']) }
  }
  return { navItems, bottomNavItems }
}
