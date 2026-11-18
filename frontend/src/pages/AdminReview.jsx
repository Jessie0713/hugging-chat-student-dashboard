import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import AdminFaqEditor from '../components/AdminFaqEditor'
import AdminGraphEditor from '../components/AdminGraphEditor'
import HabitatBackground from '../components/HabitatBackground'
import { apiGet } from '../lib/api'
import { assistantHeaders, clearAssistantAuth, getAssistantToken } from '../lib/assistantAuth'
import { buttonSecondarySx, colors, radii, type } from '../theme/tokens'

export default function AdminReview() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('faq')

  useEffect(() => {
    if (!getAssistantToken()) {
      navigate('/admin/login', { replace: true })
      return
    }
    apiGet('/api/assistant/admin/overview', { headers: assistantHeaders() })
      .then(setData)
      .catch((e) => {
        setErr(String(e.message || e))
        if (String(e.message || '').includes('403') || String(e.message || '').includes('401')) {
          navigate('/admin/login', { replace: true })
        }
      })
  }, [navigate])

  const feedback = data?.feedback || []
  const feedbackCounts = data?.feedbackCounts || {}
  const reportCount = feedbackCounts.total || 0

  const tabSx = {
    flexWrap: 'wrap',
    gap: 0.5,
    '& .MuiToggleButtonGroup-grouped': {
      borderRadius: `${radii.btn}px !important`,
      border: `1px solid ${colors.sand} !important`,
      marginLeft: '0 !important',
    },
    '& .MuiToggleButton-root': {
      fontWeight: 800,
      fontSize: 13,
      px: 1.5,
      color: colors.ink,
      '&.Mui-selected': {
        bgcolor: colors.leaf,
        color: colors.white,
        borderColor: `${colors.leaf} !important`,
      },
    },
  }

  return (
    <Box sx={{ minHeight: '100vh', position: 'relative' }}>
      <HabitatBackground />
      <Container maxWidth='lg' sx={{ position: 'relative', zIndex: 1, py: 3 }}>
        <Stack direction='row' justifyContent='space-between' alignItems='center' sx={{ mb: 2 }}>
          <Typography sx={{ ...type.pageTitle, fontSize: 22 }}>管理者</Typography>
          <Button
            sx={buttonSecondarySx}
            onClick={() => {
              clearAssistantAuth()
              navigate('/')
            }}
          >
            離開
          </Button>
        </Stack>
        {err ? <Typography color='error' sx={{ mb: 2 }}>{err}</Typography> : null}

        <ToggleButtonGroup
          exclusive
          size='small'
          value={tab}
          onChange={(_, v) => v && setTab(v)}
          sx={{ ...tabSx, mb: 2 }}
        >
          <ToggleButton value='faq'>學生 FAQ</ToggleButton>
          <ToggleButton value='graph'>教師圖譜</ToggleButton>
          <ToggleButton value='reports'>
            問題回報{reportCount ? `（${reportCount}）` : ''}
          </ToggleButton>
        </ToggleButtonGroup>

        <Box sx={{ display: tab === 'faq' ? 'block' : 'none' }}>
          <AdminFaqEditor />
        </Box>
        <Box sx={{ display: tab === 'graph' ? 'block' : 'none' }}>
          <AdminGraphEditor />
        </Box>

        {tab === 'reports' ? (
          <Card variant='outlined' sx={{ mb: 2, bgcolor: colors.paper, borderRadius: `${radii.lg}px` }}>
            <CardContent>
              <Typography sx={type.sectionTitle}>問題回報</Typography>
              <Typography sx={{ fontSize: 13, color: colors.muted, my: 1 }}>
                共 {feedbackCounts.total || 0} 則 ·
                有幫助 {feedbackCounts.helpful || 0} · 沒幫助／回報 {feedbackCounts.unhelpful || 0}
              </Typography>
              <Typography sx={{ fontSize: 12, color: colors.muted, mb: 1 }}>
                助手裡按讚、倒讚或「回報」會立刻寫入這裡。
              </Typography>
              {feedback.length === 0 ? (
                <Typography sx={{ mt: 1, fontSize: 14 }}>尚無回報。請在學生或教師助手對回答按倒讚或送出回報。</Typography>
              ) : null}
              {feedback.map((f, i) => (
                <Box key={`${f.messageId || i}-${f.createdAt || i}`} sx={{ mt: 1, p: 1.25, bgcolor: colors.wash, borderRadius: `${radii.md}px` }}>
                  <Stack direction='row' spacing={1} alignItems='center' flexWrap='wrap' useFlexGap>
                    <Chip size='small' label={f.helpful === true ? '有幫助' : f.helpful === false ? '沒幫助' : '回饋'} />
                    <Chip size='small' label={f.category || '未分類'} variant='outlined' />
                    <Chip size='small' label={f.role || 'public'} variant='outlined' />
                  </Stack>
                  {f.question ? (
                    <Typography sx={{ fontWeight: 800, mt: 0.75, fontSize: 14 }}>問：{f.question}</Typography>
                  ) : null}
                  {f.note ? (
                    <Typography sx={{ fontSize: 14, mt: 0.5, whiteSpace: 'pre-wrap' }}>{f.note}</Typography>
                  ) : (
                    <Typography sx={{ fontSize: 13, color: colors.muted, mt: 0.5 }}>沒有補充說明</Typography>
                  )}
                  <Typography sx={{ fontSize: 12, color: colors.muted, mt: 0.5 }}>
                    {f.createdAt || ''}{f.source ? ` · ${f.source}` : ''}
                  </Typography>
                </Box>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </Container>
    </Box>
  )
}
