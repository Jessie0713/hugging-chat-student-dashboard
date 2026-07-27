import { Outlet, useLocation } from 'react-router-dom'
import { Container, Box } from '@mui/material'
import { useEffect } from 'react'
import Header from '../components/Header'
import AmbientDinoScheduler from '../components/AmbientDinoScheduler'
import HabitatBackground from '../components/HabitatBackground'
import { invalidateAmbientContentCache } from '../lib/ambientContentFade'

export default function StudentLayout() {
  const { pathname } = useLocation()

  useEffect(() => {
    const bump = () => invalidateAmbientContentCache()
    bump()
    window.addEventListener('scroll', bump, { passive: true })
    window.addEventListener('resize', bump)
    return () => {
      window.removeEventListener('scroll', bump)
      window.removeEventListener('resize', bump)
    }
  }, [pathname])

  return (
    <Box
      sx={{
        m: 0,
        position: 'relative',
        minHeight: '100vh',
        background: 'transparent',
      }}
    >
      <HabitatBackground />

      {/* 頁面內容（不含 Header，避免被氛圍層蓋住導覽） */}
      <Box data-student-shell sx={{ position: 'relative', zIndex: 1 }}>
        {/* 佔位：與 sticky Header 同高，避免內容被擋住 */}
        <Box sx={{ height: { xs: 76, sm: 84 } }} aria-hidden />
        <Container maxWidth='lg' sx={{ py: 3, pb: { xs: 10, sm: 12 } }}>
          <Outlet />
        </Container>
      </Box>

      {/* 恐龍：在內容上方、Header 下方 */}
      <Box
        aria-hidden
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: 2,
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      >
        <AmbientDinoScheduler />
      </Box>

      {/* Header 獨立更高層，確保導覽可點、可立刻切頁 */}
      <Box
        data-student-header
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
        }}
      >
        <Header />
      </Box>
    </Box>
  )
}
