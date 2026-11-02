import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  GraduationCap,
  Home,
  LayoutDashboard,
  Megaphone,
  Network,
  School,
  ScrollText,
  Settings2,
  Sparkles,
  Trophy,
  UserRound,
  Users,
  UsersRound,
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
  { to: '/profile', key: 'profile', icon: UserRound },
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
  { to: '/profile', key: 'profile', icon: UserRound },
]

const guardianNav = [
  { to: '/', key: 'familyHome', icon: Home, end: true },
  { to: '/profile', key: 'profile', icon: UserRound },
]

const staffNav = [
  { to: '/', key: 'myWork', icon: Building2, end: true },
  { to: '/profile', key: 'profile', icon: UserRound },
]

export function adminNavFor(workspace, perms = []) {
  const has = new Set(perms)
  const groupLevel = !workspace?.school
  return adminNav.filter((i) => (!i.perm || has.has(i.perm)) && !(groupLevel && (i.school || (i.perm && i.perm !== 'group.view'))))
}

export function navFor(role, workspace, perms) {
  if (role === 'teacher') return { navItems: teacherNav, bottomNavItems: teacherNav }
  if (role === 'admin') {
    const items = adminNavFor(workspace, perms)
    return { navItems: items, bottomNavItems: items.slice(0, 4).concat(items.at(-1)) }
  }
  if (role === 'guardian') return { navItems: guardianNav, bottomNavItems: guardianNav }
  if (role === 'staff') return { navItems: staffNav, bottomNavItems: staffNav }
  return { navItems, bottomNavItems }
}
