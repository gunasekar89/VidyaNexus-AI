import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useApp } from './AppContext'
import Layout from './components/Layout'
import { LogoMark } from './components/Logo'
import Dashboard from './pages/Dashboard'
import SmartCalendar from './pages/SmartCalendar'
import Subjects from './pages/Subjects'
import SubjectDetail from './pages/SubjectDetail'
import AITutor from './pages/AITutor'
import Homework from './pages/Homework'
import TestsExams from './pages/TestsExams'
import Attendance from './pages/Attendance'
import AnnouncementsPage from './pages/AnnouncementsPage'
import Progress from './pages/Progress'
import Awards from './pages/Awards'
import Profile from './pages/Profile'
import Login from './pages/Login'
import TeacherDesk from './pages/TeacherDesk'

function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas">
      <LogoMark className="h-12 w-12" />
      <Loader2 className="animate-spin text-brand-600" />
    </div>
  )
}

// Student pages need the student's data loaded first.
function StudentData() {
  const { data, loadError, refresh, t, errorText } = useApp()
  if (loadError && !data)
    return (
      <div className="py-16 text-center">
        <p className="mb-4 text-sm text-rose-600">{errorText(loadError)}</p>
        <button onClick={refresh} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
          {t('retry')}
        </button>
      </div>
    )
  if (!data)
    return (
      <div className="flex justify-center py-24 text-muted">
        <Loader2 className="animate-spin" />
      </div>
    )
  return <Outlet />
}

export default function App() {
  const { authStatus, user } = useApp()
  if (authStatus === 'loading') return <Splash />
  if (!user) return <Login />

  if (user.role === 'teacher') {
    return (
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<TeacherDesk />} />
          <Route path="announcements" element={<TeacherDesk tab="announcements" />} />
          <Route path="profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="profile" element={<Profile />} />
        <Route element={<StudentData />}>
          <Route index element={<Dashboard />} />
          <Route path="calendar" element={<SmartCalendar />} />
          <Route path="subjects" element={<Subjects />} />
          <Route path="subjects/:id" element={<SubjectDetail />} />
          <Route path="ai-tutor" element={<AITutor />} />
          <Route path="homework" element={<Homework />} />
          <Route path="tests" element={<TestsExams />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="announcements" element={<AnnouncementsPage />} />
          <Route path="progress" element={<Progress />} />
          <Route path="awards" element={<Awards />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
