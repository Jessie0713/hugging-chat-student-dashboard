// src/pages/Overview.jsx
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
  ToggleButton,
  ToggleButtonGroup,
  Divider,
  Chip,
  Tooltip,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material'
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import { LineChart } from '@mui/x-charts/LineChart'
import { PieChart } from '@mui/x-charts/PieChart'
import { useTheme } from '@mui/material/styles'
import { apiGet } from '../lib/api'

/** ---------- helpers ---------- */
const CEFR_ORDER = ['PreA1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'C1C2']
const CEFR_TITLES = {
  PreA1: 'Pre-A1 (初階)',
  A1: 'A1 (入門級)',
  A2: 'A2 (基礎級)',
  B1: 'B1 (中級)',
  B2: 'B2 (進階級)',
  C1: 'C1 (高階)',
  C2: 'C2 (精通級)',
  C1C2: 'C1-C2 (高階)',
}

function orderIndex(levelKey) {
  const i = CEFR_ORDER.indexOf(levelKey)
  return i === -1 ? 999 : i
}

function safeNum(n, fallback = 0) {
  const x = Number(n)
  return Number.isFinite(x) ? x : fallback
}

/** ---------- UI components ---------- */
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

function MetricToggle({ value, label, tip }) {
  return (
    <ToggleButton value={value} disableRipple>
      <Tooltip title={tip} arrow placement='top'>
        <Box
          component='span'
          sx={{ display: 'inline-flex', alignItems: 'center' }}
        >
          {label}
        </Box>
      </Tooltip>
    </ToggleButton>
  )
}

// CEFR 圓餅圖卡片
function CefrPieCard({ cefrGroups = [], loading }) {
  const theme = useTheme()

  const { seriesData, colors } = useMemo(() => {
    const counts = {}
    cefrGroups.forEach((g) => {
      const key = g.levelKey || 'Unknown'
      counts[key] = (counts[key] || 0) + (g.assistants?.length || 0)
    })

    const labels = Object.keys(counts).sort(
      (a, b) => orderIndex(a) - orderIndex(b),
    )

    const colorMap = {
      PreA1: '#e0f2f1',
      A1: '#b2dfdb',
      A2: '#80cbc4',
      B1: '#4db6ac',
      B2: '#26a69a',
      C1: '#009688',
      C2: '#00796b',
    }

    const data = labels.map((lbl, idx) => ({
      id: idx,
      value: counts[lbl],
      label: lbl,
    }))

    const chartColors = labels.map(
      (lbl) => colorMap[lbl] || theme.palette.grey[400],
    )

    if (data.length === 0) {
      return {
        seriesData: [{ id: 0, value: 1, label: '無資料' }],
        colors: [theme.palette.grey[200]],
      }
    }

    return { seriesData: data, colors: chartColors }
  }, [cefrGroups, theme])

  return (
    <Card variant='outlined' sx={{ borderRadius: 3, height: '100%' }}>
      <CardContent>
        <Typography variant='h6' sx={{ fontWeight: 900, mb: 1 }}>
          CEFR 等級分佈
        </Typography>
        {loading ? (
          <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', justifyContent: 'center', height: 280 }}>
            <PieChart
              series={[
                {
                  data: seriesData,
                  innerRadius: 40,
                  outerRadius: 80,
                  paddingAngle: 2,
                  cornerRadius: 4,
                  highlightScope: { faded: 'global', highlighted: 'item' },
                },
              ]}
              colors={colors}
              slotProps={{ legend: { hidden: true } }}
              margin={{ top: 10, bottom: 10, left: 10, right: 10 }}
            />
          </Box>
        )}
      </CardContent>
    </Card>
  )
}

function CefrColumn({ title, assistants = [] }) {
  return (
    <Box>
      <Typography
        variant='subtitle1'
        sx={{ fontWeight: 900, textAlign: 'center', mb: 1 }}
      >
        {title}
      </Typography>

      {assistants.length ? (
        <Stack spacing={1.2}>
          {assistants.map((a) => {
            const advice = a?.advice || {}
            const focus = Array.isArray(advice.focus) ? advice.focus : []

            return (
              <Accordion
                key={a.assistantId || a.assistantName}
                disableGutters
                elevation={0}
                sx={{
                  borderRadius: 2,
                  overflow: 'hidden',
                  border: '1px solid',
                  borderColor: 'divider',
                  '&:before': { display: 'none' },
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreRoundedIcon />}
                  sx={{
                    bgcolor: 'grey.50',
                    '& .MuiAccordionSummary-content': { my: 0.5 },
                  }}
                >
                  <Typography sx={{ fontWeight: 800 }}>
                    {a.assistantName || '未命名情境'}
                  </Typography>
                </AccordionSummary>

                <AccordionDetails sx={{ pt: 1.25 }}>
                  <Stack
                    direction='row'
                    spacing={1}
                    sx={{ mb: 1 }}
                    useFlexGap
                    flexWrap='wrap'
                  >
                    {a.levelKey && (
                      <Chip size='small' label={`目前：${a.levelKey}`} />
                    )}
                    {a.nextLevelKey && (
                      <Chip
                        size='small'
                        variant='outlined'
                        label={`下一階：${a.nextLevelKey}`}
                      />
                    )}
                    {a.confidence != null && (
                      <Chip
                        size='small'
                        variant='outlined'
                        color='info'
                        label={`信心 ${a.confidence}`}
                      />
                    )}
                  </Stack>

                  {focus.length ? (
                    <>
                      <Typography
                        variant='subtitle2'
                        sx={{ fontWeight: 900, mb: 0.5 }}
                      >
                        需要加強
                      </Typography>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {focus.slice(0, 8).map((f, i) => (
                          <li key={i}>
                            <Typography variant='body2'>{f}</Typography>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <Typography variant='body2' sx={{ opacity: 0.7 }}>
                      目前沒有常見錯誤/重點項目
                    </Typography>
                  )}
                  {advice.nextTask && (
                    <Typography variant='body2' sx={{ mt: 1 }}>
                      <b>下一步任務：</b> {advice.nextTask}
                    </Typography>
                  )}
                </AccordionDetails>
              </Accordion>
            )
          })}
        </Stack>
      ) : (
        <Typography
          variant='body2'
          sx={{ opacity: 0.7, textAlign: 'center', mt: 2 }}
        >
          目前沒有資料
        </Typography>
      )}
    </Box>
  )
}

/** ---------- page ---------- */
export default function Overview() {
  const params = useParams()
  const hfUserId =
    params.hfUserId ||
    (() => {
      const m = window.location.pathname.match(/student\/([^/]+)/)
      return m?.[1]
    })()

  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [metric, setMetric] = useState('englishRatio')

  useEffect(() => {
    if (!hfUserId) return
    setErr('')
    setData(null)
    apiGet(`/api/student/${hfUserId}/overview`)
      .then(setData)
      .catch((e) => setErr(String(e)))
  }, [hfUserId])

  const loading = !data && !err

  const stats = data?.stats ?? {}
  const ts = data?.timeseries ?? { labels: [] }
  const labels = ts.labels ?? []

  const lineSeries = useMemo(() => {
    const mapping = {
      englishRatio: { y: ts.englishRatio, label: '英文佔比' },
      lexicalRichness: { y: ts.lexicalRichness, label: '詞彙豐富度' },
      avgTurns: { y: ts.avgTurns, label: '平均輪次' },
      avgDurationMin: { y: ts.avgDurationMin, label: '平均時長(分)' },
    }
    return mapping[metric] || mapping.englishRatio
  }, [ts, metric])

  const cefrGroups = useMemo(() => {
    const arr = Array.isArray(data?.cefrGroups) ? data.cefrGroups : []
    return [...arr].sort(
      (a, b) => orderIndex(a.levelKey) - orderIndex(b.levelKey),
    )
  }, [data])

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
      {/* 1. 第一列：統計數據卡片 */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item size={{ xs: 12, sm: 3 }}>
          <StatCard
            title='英文佔比'
            value={
              loading ? '—' : Math.round(safeNum(stats.englishRatio, 0) * 100)
            }
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

      {/* 2. 第二列：三個圖表 */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {/* 圖表 A: 學習趨勢 (包含 4 個 Tabs) */}
        <Grid item size={{ xs: 12, md: 4 }}>
          <Card variant='outlined' sx={{ borderRadius: 3, height: '100%' }}>
            <CardContent>
              <Stack spacing={1} sx={{ mb: 2 }}>
                <Typography variant='h6' sx={{ fontWeight: 900 }}>
                  學習趨勢
                </Typography>

                {/* 4 個 Tabs，選中變主色+白字 */}
                <ToggleButtonGroup
                  size='small'
                  value={metric}
                  exclusive
                  onChange={(_, v) => v && setMetric(v)}
                  fullWidth
                  sx={{
                    '& .MuiToggleButton-root': {
                      color: 'primary.main',
                      border: '1px solid',
                      borderColor: 'primary.main',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      py: 0.5,
                      '&:hover': { bgcolor: 'action.hover' },
                    },
                    '& .MuiToggleButton-root.Mui-selected': {
                      bgcolor: 'primary.main', // 選中背景主色
                      color: '#fff', // 選中文字白色
                      '&:hover': { bgcolor: 'primary.dark' },
                    },
                  }}
                >
                  <MetricToggle
                    value='englishRatio'
                    label='語言'
                    tip='英文使用比例'
                  />
                  <MetricToggle
                    value='lexicalRichness'
                    label='豐富'
                    tip='詞彙多樣性'
                  />
                  <MetricToggle
                    value='avgTurns'
                    label='互動'
                    tip='平均對話輪次'
                  />
                  <MetricToggle
                    value='avgDurationMin'
                    label='時長'
                    tip='平均對話時間'
                  />
                </ToggleButtonGroup>
              </Stack>
              {loading ? (
                <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}>
                  <CircularProgress />
                </Box>
              ) : (
                <LineChart
                  xAxis={[{ scaleType: 'point', data: labels }]}
                  series={[
                    {
                      data: lineSeries.y || [],
                      label: lineSeries.label,
                      color: '#54a9c0',
                    },
                  ]}
                  height={220}
                  margin={{ left: 30, right: 30, top: 10, bottom: 30 }}
                  slotProps={{ legend: { hidden: true } }}
                />
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* 圖表 B: CEFR 分佈 (Pie) */}
        <Grid item size={{ xs: 12, md: 4 }}>
          <CefrPieCard cefrGroups={cefrGroups} loading={loading} />
        </Grid>

        {/* 圖表 C: 空白佔位符 (Placeholder) */}
        <Grid item size={{ xs: 12, md: 4 }}>
          <Card
            variant='outlined'
            sx={{
              borderRadius: 3,
              height: '100%',
              borderStyle: 'dashed',
              borderColor: 'grey.300',
            }}
          >
            <CardContent
              sx={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
              }}
            >
              <Typography
                variant='h6'
                color='text.secondary'
                sx={{ opacity: 0.5, fontWeight: 700 }}
              >
                (更多圖表規劃中)
              </Typography>
              <Typography
                variant='caption'
                color='text.secondary'
                sx={{ opacity: 0.5 }}
              >
                Coming Soon
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 3. 第三列：CEFR 詳細建議 */}
      <Grid container spacing={2}>
        <Grid item size={{ xs: 12 }}>
          <Card variant='outlined' sx={{ borderRadius: 3 }}>
            <CardContent>
              <Stack direction='row' alignItems='baseline' spacing={1}>
                <Typography variant='h6' sx={{ fontWeight: 900 }}>
                  CEFR 詳細建議
                </Typography>
                <Typography variant='body2' sx={{ opacity: 0.7 }}>
                  根據各情境表現分析
                </Typography>
              </Stack>
              <Divider sx={{ my: 1.5 }} />

              {loading ? (
                <Box sx={{ py: 3, display: 'grid', placeItems: 'center' }}>
                  <CircularProgress size={22} />
                </Box>
              ) : (
                <Grid container spacing={2}>
                  {cefrGroups.map((g) => (
                    <Grid key={g.levelKey} item size={{ xs: 12, sm: 6, lg: 4 }}>
                      <CefrColumn
                        title={g.title || CEFR_TITLES[g.levelKey] || g.levelKey}
                        assistants={g.assistants || []}
                      />
                    </Grid>
                  ))}
                  {!cefrGroups.length && (
                    <Grid item xs={12}>
                      <Typography variant='body2' sx={{ opacity: 0.7 }}>
                        目前沒有 CEFR 建議資料
                      </Typography>
                    </Grid>
                  )}
                </Grid>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
