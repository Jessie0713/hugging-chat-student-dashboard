import { useEffect } from 'react'
import { Link as RouterLink, Outlet, useNavigate, useParams } from 'react-router-dom'
import {
  AppBar,
  Box,
  Button,
  Container,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  Typography,
} from '@mui/material'
import HabitatBackground from '../components/HabitatBackground'
import { clearTeacherCode, getTeacherCode } from '../lib/teacherAuth'
import {
  buttonSecondarySx,
  colors,
  dinoShadow,
  type,
} from '../theme/tokens'

const COHORTS = [
  { id: 'rolling_level', label: '變動等級' },
  { id: 'fixed_level', label: '固定等級' },
  { id: 'all', label: '兩組合計' },
]

export default function TeacherLayout() {
  const { source } = useParams()
  const navigate = useNavigate()
  const cohort = source || 'rolling_level'

  useEffect(() => {
    if (!getTeacherCode()) {
      navigate('/', { replace: true })
    }
  }, [navigate])

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

      <Box data-student-shell sx={{ position: 'relative', zIndex: 1 }}>
        <Box sx={{ height: { xs: 76, sm: 84 } }} aria-hidden />
        <Container maxWidth='lg' sx={{ py: 2.5, pb: { xs: 8, sm: 10 } }}>
          <Outlet />
        </Container>
      </Box>

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
        <AppBar
          position='relative'
          elevation={0}
          sx={{
            color: colors.ink,
            borderBottom: 'none',
            background: `linear-gradient(180deg, ${colors.paper} 0%, ${colors.wash} 100%)`,
            boxShadow: 'none',
            overflow: 'visible',
            '&::after': {
              content: '""',
              display: 'block',
              height: 0,
              borderBottom: `3px dashed ${colors.leaf}aa`,
            },
          }}
        >
          <Toolbar
            disableGutters
            sx={{ minHeight: { xs: 76, sm: 84 }, overflow: 'visible', py: 0.5 }}
          >
            <Container
              maxWidth='lg'
              sx={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'nowrap',
                gap: { xs: 1, sm: 2 },
                px: { xs: 2, sm: 2 },
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.25,
                  flexGrow: 1,
                  minWidth: 0,
                }}
              >
                <Box
                  component='img'
                  src='/dinosaurs/dino-kaiju.png'
                  alt=''
                  sx={{
                    width: { xs: 52, sm: 64 },
                    height: { xs: 52, sm: 64 },
                    objectFit: 'contain',
                    filter: dinoShadow,
                    userSelect: 'none',
                  }}
                />
                <Typography sx={{ ...type.sectionTitle, fontSize: { xs: 18, sm: 22 } }}>
                  教師儀表板
                </Typography>
              </Box>
              <ToggleButtonGroup
                exclusive
                size='small'
                value={cohort}
                onChange={(_, v) => v && navigate(`/teacher/${v}`)}
                sx={{
                  flexShrink: 0,
                  '& .MuiToggleButton-root': {
                    fontWeight: 800,
                    fontSize: 13,
                    px: 1.25,
                    color: colors.ink,
                    borderColor: colors.sand,
                    '&.Mui-selected': {
                      bgcolor: colors.sageSoft,
                      color: colors.ink,
                      borderColor: colors.leaf,
                    },
                  },
                }}
              >
                {COHORTS.map((c) => (
                  <ToggleButton key={c.id} value={c.id}>
                    {c.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              <Button
                component={RouterLink}
                to='/'
                onClick={() => clearTeacherCode()}
                sx={buttonSecondarySx}
              >
                離開
              </Button>
            </Container>
          </Toolbar>
        </AppBar>
      </Box>
    </Box>
  )
}
