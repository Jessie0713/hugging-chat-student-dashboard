import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Box,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  Stack,
  Typography,
  Tooltip,
  IconButton,
} from '@mui/material'
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded'
import { LineChart } from '@mui/x-charts/LineChart'
import { apiGet } from '../lib/api'

function safeNum(n, fallback = 0) {
  const x = Number(n)
  return Number.isFinite(x) ? x : fallback
}

function InfoIcon({ title }) {
  return (
    <Tooltip title={title} arrow placement='top'>
      <IconButton
        size='small'
        sx={{
          ml: 0.5,
          p: 0.25,
          opacity: 0.7,
          '&:hover': { opacity: 1 },
        }}
      >
        <HelpOutlineRoundedIcon fontSize='inherit' />
      </IconButton>
    </Tooltip>
  )
}

function StatCard({ title, value, suffix = '', help }) {
  return (
    <Card variant='outlined' sx={{ borderRadius: 3, height: '100%' }}>
      <CardContent>
        <Stack direction='row' alignItems='center' spacing={0.5}>
          <Typography variant='body2' sx={{ opacity: 0.75 }}>
            {title}
          </Typography>
          {help ? <InfoIcon title={help} /> : null}
        </Stack>
        <Typography variant='h5' sx={{ fontWeight: 900, mt: 0.5 }}>
          {value}
          {suffix}
        </Typography>
      </CardContent>
    </Card>
  )
}

function TrendCard({ title, labels, data, loading }) {
  return (
    <Card
      variant='outlined'
      sx={{
        borderRadius: 3,
        height: 360,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <CardContent sx={{ flex: 1, minHeight: 0 }}>
        <Typography variant='h6' sx={{ fontWeight: 900, mb: 1 }}>
          {title}
        </Typography>
        {loading ? (
          <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}>
            <CircularProgress />
          </Box>
        ) : (
          <LineChart
            xAxis={[{ scaleType: 'point', data: labels }]}
            series={[
              {
                data: data || [],
                label: title,
                color: '#54a9c0',
              },
            ]}
            height={260}
            margin={{ left: 30, right: 30, top: 10, bottom: 30 }}
            slotProps={{ legend: { hidden: true } }}
          />
        )}
      </CardContent>
    </Card>
  )
}

export default function OverviewHuggingchat() {
  const { source, hfUserId } = useParams()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!hfUserId) return
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) {
        setErr('')
        setData(null)
      }
    })
    apiGet(`/api/${source}/student/${hfUserId}/overview`)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [source, hfUserId])

  const loading = !data && !err
  const stats = data?.stats ?? {}
  const ts = data?.timeseries ?? { labels: [] }
  const labels = Array.isArray(ts.labels) ? ts.labels : []

  const charts = useMemo(
    () => [
      {
        key: 'englishRatio',
        title: '英文佔比',
        data: (ts.englishRatio || []).map((x) => Math.round(safeNum(x, 0) * 100)),
      },
      {
        key: 'lexicalRichness',
        title: '詞彙豐富度',
        data: (ts.lexicalRichness || []).map((x) => Number(safeNum(x, 0).toFixed(2))),
      },
      { key: 'avgTurns', title: '平均輪次', data: ts.avgTurns || [] },
      { key: 'avgDurationMin', title: '平均時長(分)', data: ts.avgDurationMin || [] },
    ],
    [ts],
  )

  if (err) {
    return (
      <Card variant='outlined'>
        <CardContent>
          <Typography variant='h6' color='error'>
            讀取失敗
          </Typography>
          <Typography sx={{ whiteSpace: 'pre-wrap', mt: 1 }}>{err}</Typography>
        </CardContent>
      </Card>
    )
  }

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item size={{ xs: 12, sm: 3 }}>
          <StatCard
            title='英文佔比'
            value={loading ? '—' : Math.round(safeNum(stats.englishRatio, 0) * 100)}
            suffix='%'
            help='學生與機器人聊天時，英文使用比例。'
          />
        </Grid>
        <Grid item size={{ xs: 12, sm: 3 }}>
          <StatCard
            title='詞彙豐富度'
            value={loading ? '—' : safeNum(stats.lexicalRichness, 0).toFixed(2)}
            help='獨特詞彙數 / 總詞彙數。'
          />
        </Grid>
        <Grid item size={{ xs: 12, sm: 3 }}>
          <StatCard
            title='平均輪次'
            value={loading ? '—' : safeNum(stats.avgTurns, 0)}
            help='每次對話平均來回次數。'
          />
        </Grid>
        <Grid item size={{ xs: 12, sm: 3 }}>
          <StatCard
            title='平均時長'
            value={loading ? '—' : safeNum(stats.avgDurationMin, 0)}
            suffix=' 分'
            help='每次對話平均時間。'
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        {charts.map((c) => (
          <Grid key={c.key} item size={{ xs: 12, md: 6 }}>
            <TrendCard
              title={c.title}
              labels={labels}
              data={c.data}
              loading={loading}
            />
          </Grid>
        ))}
      </Grid>
    </Box>
  )
}

