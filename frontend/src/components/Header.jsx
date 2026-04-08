// src/components/StudentHeader.jsx
import { useEffect, useState } from 'react'
import { NavLink, useParams } from 'react-router-dom'
import {
  AppBar,
  Box,
  Container,
  Toolbar,
  Typography,
  Button,
} from '@mui/material'
import { apiGet } from '../lib/api'

const NavItem = ({ to, label }) => {
  return (
    <Button
      component={NavLink}
      to={to}
      // NavLink 會把 active class 加上去（我們用它做底線）
      className={({ isActive }) => (isActive ? 'active' : '')}
      disableRipple
      sx={{
        position: 'relative',
        px: 1.5,
        py: 1,
        minWidth: 0,
        borderRadius: 0,
        textTransform: 'none',
        fontWeight: 700,
        color: 'text.primary',
        backgroundColor: 'transparent',
        '&:hover': {
          backgroundColor: 'transparent',
          color: 'primary.main',
        },
        // 底線（hover/active 都顯示）
        '&::after': {
          content: '""',
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 2,
          height: 2,
          backgroundColor: 'primary.main',
          transform: 'scaleX(0)',
          transformOrigin: 'left',
          transition: 'transform 160ms ease',
        },
        '&:hover::after': { transform: 'scaleX(1)' },
        '&.active': { color: 'primary.main' },
        '&.active::after': { transform: 'scaleX(1)' },
      }}
    >
      {label}
    </Button>
  )
}

export default function StudentHeader() {
  const { hfUserId } = useParams()
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    setProfile(null)
    apiGet(`/api/student/${hfUserId}/profile`)
      .then(setProfile)
      .catch(() => setProfile(null))
  }, [hfUserId])

  const displayName =
    profile?.lastname || profile?.firstname
      ? `${profile?.lastname ?? ''}${profile?.firstname ?? ''}您好`
      : `ID ${hfUserId} 您好`

  return (
    <AppBar
      position='sticky'
      elevation={0}
      sx={{
        bgcolor: 'background.paper',
        color: 'text.primary',
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Toolbar disableGutters sx={{ minHeight: 72 }}>
        <Container
          maxWidth='lg'
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            px: { xs: 2, sm: 2 },
          }}
        >
          {/* 左側 Logo/品牌 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              variant='h6'
              sx={{ fontWeight: 900, letterSpacing: 0.3 }}
            >
              HuggingChat Dashboard
            </Typography>
          </Box>

          {/* 中間導覽（總覽 / 對話分析 / 獎章） */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <NavItem to={`/student/${hfUserId}/overview`} label='總覽' />
            <NavItem
              to={`/student/${hfUserId}/conversations`}
              label='對話分析'
            />
            {/* <NavItem to={`/student/${hfUserId}/badges`} label='獎章' /> */}
          </Box>

          <Box sx={{ flex: 1 }} />

          {/* 右側 Moodle 使用者姓名 */}
          <Typography variant='body1' sx={{ fontWeight: 700 }}>
            {displayName}
          </Typography>
        </Container>
      </Toolbar>
    </AppBar>
  )
}
