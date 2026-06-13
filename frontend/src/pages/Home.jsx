// src/pages/Home.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  Card,
  CardContent,
  ToggleButton,
  ToggleButtonGroup,
  TextField,
  Typography,
} from '@mui/material'

export default function Home() {
  const [id, setId] = useState('')
  const [source, setSource] = useState('rolling_level')
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
            id='hfUserId'
            name='hfUserId'
            label='hfUserId'
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder='例如 154708'
          />

          <Box sx={{ mt: 2 }}>
            <Typography variant='body2' sx={{ opacity: 0.8, mb: 1 }}>
              資料來源
            </Typography>
            <ToggleButtonGroup
              size='small'
              value={source}
              exclusive
              onChange={(_, v) => v && setSource(v)}
              sx={{ '& .MuiToggleButton-root': { fontWeight: 800 } }}
            >
              <ToggleButton value='rolling_level'>
                滾動式調整（rolling_level）
              </ToggleButton>
              <ToggleButton value='fixed_level'>
                固定等級（fixed_level）
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Button
            sx={{ mt: 2 }}
            fullWidth
            variant='contained'
            onClick={() => {
              if (!id.trim()) return
              navigate(
                `/${source}/student/${encodeURIComponent(id.trim())}/overview`,
              )
            }}
          >
            進入
          </Button>
        </CardContent>
      </Card>
    </Box>
  )
}
