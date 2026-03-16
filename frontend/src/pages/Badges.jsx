// src/pages/Badges.jsx
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Box,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  Typography,
} from '@mui/material'
import { apiGet } from '../lib/api'

function BadgeSlot({ unlocked, title }) {
  return (
    <Box
      sx={{
        width: 72,
        height: 72,
        borderRadius: '50%',
        border: '1px solid',
        borderColor: unlocked ? 'primary.main' : 'divider',
        display: 'grid',
        placeItems: 'center',
        bgcolor: unlocked ? 'action.hover' : 'background.paper',
        fontWeight: 800,
        fontSize: 22,
      }}
      title={title}
    >
      {unlocked ? '🏅' : '?'}
    </Box>
  )
}

export default function Badges() {
  const { hfUserId } = useParams()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const loading = !data && !err

  useEffect(() => {
    setErr('')
    setData(null)
    apiGet(`/api/student/${hfUserId}/badges`)
      .then(setData)
      .catch((e) => setErr(String(e)))
  }, [hfUserId])

  const slots = useMemo(() => {
    const badges = data?.badges || []
    // 預設先展示 10 格（像你截圖）
    const totalSlots = 10
    const filled = badges.map((b) => ({
      unlocked: true,
      title: b.name || 'badge',
    }))
    while (filled.length < totalSlots)
      filled.push({ unlocked: false, title: 'locked' })
    return filled.slice(0, totalSlots)
  }, [data])

  return (
    <Box>
      <Typography variant='h5' sx={{ fontWeight: 700, mb: 2 }}>
        獎章
      </Typography>

      <Card variant='outlined'>
        <CardContent>
          <Typography variant='h6' sx={{ fontWeight: 700, mb: 2 }}>
            已獲得獎章
          </Typography>

          {err ? (
            <Typography color='error' sx={{ whiteSpace: 'pre-wrap' }}>
              {err}
            </Typography>
          ) : loading ? (
            <CircularProgress size={22} />
          ) : (
            <Grid container spacing={2}>
              {slots.map((s, idx) => (
                <Grid item key={idx}>
                  <BadgeSlot unlocked={s.unlocked} title={s.title} />
                </Grid>
              ))}
            </Grid>
          )}

          <Typography variant='body2' sx={{ mt: 2, opacity: 0.7 }}>
            你之後只要在後端把 /badges 回傳 badges array（含
            name、icon、earnedAt），前端就會自動顯示已解鎖。
          </Typography>
        </CardContent>
      </Card>
    </Box>
  )
}
