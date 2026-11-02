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
import Home from './pages/Home'
import Login from './pages/Login'
import { Invite, Recover, Reset } from './pages/Account'
import WorkspacesPage, { WorkspaceGate } from './pages/Workspaces'
import TeacherDesk from './pages/TeacherDesk'
import Family from './pages/Family'
import StaffHome from './pages/StaffHome'
import { AdminOverview, Audit, Group, People, Setup, Staff, Students } from './pages/admin/Admin'

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

// Pages every signed-in workspace shares.
const common = [
  <Route key="profile" path="profile" element={<Profile />} />,
  <Route key="workspaces" path="workspaces" element={<WorkspacesPage />} />,
]

function WorkspaceRoutes() {
  const { user, workspace } = useApp()
  const perms = new Set(workspace?.permissions ?? [])

  if (user.role === 'admin') {
    const groupLevel = !workspace.school
    return (
      <Routes>
        <Route element={<Layout />}>
          <Route index element={groupLevel ? <Group /> : <AdminOverview />} />
          {perms.has('group.view') && <Route path="group" element={<Group />} />}
          {!groupLevel && perms.has('members.view') && <Route path="people" element={<People />} />}
          {!groupLevel && perms.has('students.view') && <Route path="students" element={<Students />} />}
          {!groupLevel && perms.has('staff.view') && <Route path="staff" element={<Staff />} />}
          {!groupLevel && <Route path="setup" element={<Setup />} />}
          {!groupLevel && perms.has('audit.view') && <Route path="audit" element={<Audit />} />}
          {common}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    )
  }

  if (user.role === 'guardian' || user.role === 'staff') {
    return (
      <Routes>
        <Route element={<Layout />}>
          <Route index element={user.role === 'guardian' ? <Family /> : <StaffHome />} />
          {common}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    )
  }

  if (user.role === 'teacher') {
    return (
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<TeacherDesk />} />
          <Route path="announcements" element={<TeacherDesk tab="announcements" />} />
          <Route path="my-work" element={<StaffHome />} />
          {common}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        {common}
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

export default function App() {
  const { authStatus, user, workspace } = useApp()
  if (authStatus === 'loading') return <Splash />

  // Invitation and reset links work whether or not someone is signed in.
  return (
    <Routes>
      <Route path="invite/:token" element={<Invite />} />
      <Route path="reset/:token" element={<Reset />} />
      {!user ? (
        <>
          <Route index element={<Home />} />
          <Route path="login/:portal" element={<Login />} />
          <Route path="recover" element={<Recover />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      ) : !workspace || user.role === 'none' ? (
        <Route path="*" element={<WorkspaceGate />} />
      ) : (
        <Route path="*" element={<WorkspaceRoutes />} />
      )}
    </Routes>
  )
}
