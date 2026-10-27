import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Button, Card, CardContent, TextField, Typography } from '@mui/material'
import HabitatBackground from '../components/HabitatBackground'
import { apiPost } from '../lib/api'
import { setAssistantToken } from '../lib/assistantAuth'
import { buttonPrimarySx, colors, radii } from '../theme/tokens'

export default function AdminLogin() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const navigate = useNavigate()

  const submit = async () => {
    setErr('')
    try {
      const data = await apiPost('/api/assistant/auth/admin', { username, password })
      setAssistantToken(data.token)
      navigate('/admin', { replace: true })
    } catch (e) {
      setErr(String(e.message || e))
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', position: 'relative' }}>
      <HabitatBackground />
      <Card variant='outlined' sx={{ position: 'relative', zIndex: 1, width: 'min(440px, 92vw)', bgcolor: colors.paper, borderRadius: `${radii.lg}px` }}>
        <CardContent>
          <Typography variant='h5' sx={{ fontWeight: 800, mb: 1 }}>管理者登入</Typography>
          <Typography sx={{ fontSize: 13, color: colors.muted, mb: 2, fontWeight: 700 }}>
            帳號由伺服器初始化，不可自行註冊。
          </Typography>
          <TextField fullWidth label='帳號' value={username} onChange={(e) => setUsername(e.target.value)} sx={{ mb: 1.5 }} />
          <TextField fullWidth type='password' label='密碼' value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()} />
          {err ? <Typography color='error' sx={{ mt: 1 }}>{err}</Typography> : null}
          <Button fullWidth onClick={submit} sx={{ ...buttonPrimarySx, mt: 2 }}>進入</Button>
        </CardContent>
      </Card>
    </Box>
  )
}
