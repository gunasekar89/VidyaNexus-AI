import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
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
import Profile from './pages/Profile'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
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
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
