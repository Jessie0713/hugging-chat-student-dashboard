// src/App.jsx
import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import StudentLayout from './pages/StudentLayout'
import OverviewPage from './pages/OverviewPage'
import Conversations from './pages/Conversations'
import Badges from './pages/Badges'
import PracticeNextPage from './pages/PracticeNextPage'
import TeacherLayout from './pages/TeacherLayout'
import TeacherRoster from './pages/TeacherRoster'

export default function App() {
  return (
    <Routes>
      <Route path='/' element={<Home />} />

      <Route path='/teacher' element={<Navigate to='/teacher/rolling_level' replace />} />
      <Route path='/teacher/:source' element={<TeacherLayout />}>
        <Route index element={<TeacherRoster />} />
      </Route>

      <Route path='/:source/student/:hfUserId' element={<StudentLayout />}>
        <Route index element={<Navigate to='overview' replace />} />
        <Route path='overview' element={<OverviewPage />} />
        <Route path='conversations' element={<Conversations />} />
        <Route path='practice-next' element={<PracticeNextPage />} />
        <Route path='badges' element={<Badges />} />
      </Route>

      <Route path='*' element={<Navigate to='/' replace />} />
    </Routes>
  )
}
