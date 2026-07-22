import { Outlet, useLocation } from 'react-router-dom'
import { Container, Box } from '@mui/material'
import Header from '../components/Header'
import AmbientFlyer from '../components/AmbientFlyer'
import AmbientGroundExclusive from '../components/AmbientGroundExclusive'
import HabitatBackground from '../components/HabitatBackground'

export default function StudentLayout() {
  const { pathname } = useLocation()
  const showFlyer = pathname.includes('/overview')

  return (
    <Box
      sx={{
        m: 0,
        position: 'relative',
        minHeight: '100vh',
        background: 'transparent',
      }}
    >
      {/* 氛圍層：一律在儀表板後方 */}
      <Box aria-hidden sx={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <HabitatBackground />
        <AmbientGroundExclusive />
        {showFlyer ? <AmbientFlyer /> : null}
      </Box>
      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <Header />
        <Container maxWidth='lg' sx={{ py: 3, pb: { xs: 10, sm: 12 } }}>
          <Outlet />
        </Container>
      </Box>
    </Box>
  )
}
