import { BarChart3, BookOpen, CalendarDays, ClipboardList, FileText, Home, Megaphone, School, Sparkles, Trophy, UserRound, Users } from 'lucide-react'

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
  { to: '/profile', key: 'profile', icon: UserRound },
]

export const navFor = (role) =>
  role === 'teacher' ? { navItems: teacherNav, bottomNavItems: teacherNav } : { navItems, bottomNavItems }
