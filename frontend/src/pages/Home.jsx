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
import HabitatBackground from '../components/HabitatBackground'
import { setTeacherCode, TEACHER_ACCESS_CODE } from '../lib/teacherAuth'
import { colors, radii } from '../theme/tokens'

const MODE_STUDENT_ROLLING = 'rolling_level'
const MODE_STUDENT_FIXED = 'fixed_level'
const MODE_TEACHER = 'teacher'

export default function Home() {
  const [id, setId] = useState('')
  const [mode, setMode] = useState(MODE_STUDENT_ROLLING)
  const [err, setErr] = useState('')
  const navigate = useNavigate()
  const isTeacher = mode === MODE_TEACHER

  const handleMode = (_, v) => {
    if (!v) return
    setMode(v)
    setErr('')
    setId('')
  }

  const handleEnter = () => {
    const value = id.trim()
    if (!value) return
    if (isTeacher) {
      if (value !== TEACHER_ACCESS_CODE) {
        setErr('教師代碼不正確')
        return
      }
      setTeacherCode(value)
      navigate('/teacher/rolling_level')
      return
    }
    navigate(`/${mode}/student/${encodeURIComponent(value)}/overview`)
  }

  return (
    <Box
      sx={{
        position: 'relative',
        minHeight: '100vh',
        background: 'transparent',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <HabitatBackground />
      <Card
        variant='outlined'
        sx={{
          position: 'relative',
          zIndex: 1,
          width: 'min(560px, 92vw)',
          bgcolor: colors.paper,
          borderColor: colors.line,
          borderRadius: `${radii.lg}px`,
        }}
      >
        <CardContent>
          <Typography variant='h5' sx={{ fontWeight: 700, mb: 1 }}>
            {isTeacher ? '進入教師儀表板' : '進入學生儀表板'}
          </Typography>
          <Typography variant='body2' sx={{ opacity: 0.8, mb: 2 }}>
            {isTeacher
              ? '請輸入教師代碼，可查看全體學生學習狀況、聊天紀錄與成績。'
              : '請輸入 hfUserId（會帶入網址列）'}
          </Typography>

          <TextField
            fullWidth
            id='accessId'
            name='accessId'
            label={isTeacher ? '教師代碼' : 'hfUserId'}
            value={id}
            onChange={(e) => {
              setId(e.target.value)
              setErr('')
            }}
            type={isTeacher ? 'password' : 'text'}
            autoComplete={isTeacher ? 'off' : 'username'}
            placeholder={isTeacher ? '請輸入代碼' : '例如 154708'}
            error={Boolean(err)}
            helperText={err}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleEnter()
            }}
          />

          <Box sx={{ mt: 2 }}>
            <Typography variant='body2' sx={{ opacity: 0.8, mb: 1 }}>
              分流
            </Typography>
            <ToggleButtonGroup
              size='small'
              value={mode}
              exclusive
              onChange={handleMode}
              sx={{
                flexWrap: 'wrap',
                '& .MuiToggleButton-root': { fontWeight: 800 },
              }}
            >
              <ToggleButton value={MODE_STUDENT_ROLLING}>
                變動等級
              </ToggleButton>
              <ToggleButton value={MODE_STUDENT_FIXED}>
                固定等級
              </ToggleButton>
              <ToggleButton value={MODE_TEACHER}>教師儀表板</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Button
            sx={{ mt: 2 }}
            fullWidth
            variant='contained'
            onClick={handleEnter}
          >
            進入
          </Button>
        </CardContent>
      </Card>
    </Box>
  )
}
