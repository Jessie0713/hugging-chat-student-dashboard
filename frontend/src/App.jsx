// src/App.jsx
import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import StudentLayout from './pages/StudentLayout'
import Overview from './pages/Overview'
import Conversations from './pages/Conversations'
import Badges from './pages/Badges'

export default function App() {
  return (
    <Routes>
      <Route path='/' element={<Home />} />

      <Route path='/student/:hfUserId' element={<StudentLayout />}>
        <Route index element={<Navigate to='overview' replace />} />
        <Route path='overview' element={<Overview />} />
        <Route path='conversations' element={<Conversations />} />
        <Route path='badges' element={<Badges />} />
      </Route>

      <Route path='*' element={<Navigate to='/' replace />} />
    </Routes>
  )
}
