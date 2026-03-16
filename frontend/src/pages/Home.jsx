// src/pages/Home.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Typography,
} from '@mui/material'

export default function Home() {
  const [id, setId] = useState('')
  const navigate = useNavigate()

  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '80vh' }}>
      <Card variant='outlined' sx={{ width: 'min(520px, 92vw)' }}>
        <CardContent>
          <Typography variant='h5' sx={{ fontWeight: 700, mb: 1 }}>
            進入學生儀表板
          </Typography>
          <Typography variant='body2' sx={{ opacity: 0.8, mb: 2 }}>
            請輸入 hfUserId（會帶入網址列）
          </Typography>

          <TextField
            fullWidth
            label='hfUserId'
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder='例如 154708'
          />

          <Button
            sx={{ mt: 2 }}
            fullWidth
            variant='contained'
            onClick={() => {
              if (!id.trim()) return
              navigate(`/student/${encodeURIComponent(id.trim())}/overview`)
            }}
          >
            進入
          </Button>
        </CardContent>
      </Card>
    </Box>
  )
}
