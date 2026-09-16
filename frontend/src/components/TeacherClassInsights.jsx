import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded'
import { LineChart } from '@mui/x-charts/LineChart'
import { useTheme } from '@mui/material/styles'
import { apiGet, apiPost } from '../lib/api'
import { teacherHeaders } from '../lib/teacherAuth'
import { buttonPrimarySx, colors, radii, type } from '../theme/tokens'

const CHART_LINE_WIDTH = 3

const COHORT_SERIES = [
  { id: 'rolling', label: '變動等級', color: colors.leaf, dash: 'solid' },
  { id: 'fixed', label: '固定等級', color: colors.woodDark, dash: 'dashed' },
]

export function CohortLegend({ rollingCount, fixedCount, variant = 'line' }) {
  const counts = {
    rolling: rollingCount,
    fixed: fixedCount,
  }
  return (
    <Stack direction='row' spacing={1.5} alignItems='center' flexWrap='wrap' useFlexGap>
      {COHORT_SERIES.map((c) => (
        <Stack key={c.id} direction='row' spacing={0.75} alignItems='center'>
          {variant === 'bar' ? (
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: '2px',
                bgcolor: c.color,
                flexShrink: 0,
              }}
            />
          ) : (
            <Box
              sx={{
                width: 22,
                borderTop: `${CHART_LINE_WIDTH}px ${c.dash} ${c.color}`,
                flexShrink: 0,
              }}
            />
          )}
          <Typography sx={{ fontWeight: 800, fontSize: 13, color: colors.ink }}>
            {c.label}
            {counts[c.id] != null ? (
              <Box component='span' sx={{ ml: 0.5, color: colors.muted, fontWeight: 700 }}>
                {counts[c.id]} 人
              </Box>
            ) : null}
          </Typography>
        </Stack>
      ))}
    </Stack>
  )
}

function formatChartDay(value) {
  const text = String(value || '')
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return text
  return `${Number(m[2])}/${Number(m[3])}`
}

const panelSx = {
  borderRadius: `${radii.lg}px`,
  bgcolor: colors.paper,
  borderColor: colors.line,
  height: { xs: 'auto', md: 380 },
  display: 'flex',
  flexDirection: 'column',
}

const panelBodySx = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  '&:last-child': { pb: 2 },
}

function safeNum(v, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export function StatCard({ title, value, suffix = '', help }) {
  return (
    <Card
      variant='outlined'
      sx={{
        borderRadius: `${radii.lg}px`,
        bgcolor: colors.paper,
        borderColor: colors.line,
        height: '100%',
      }}
    >
      <CardContent sx={{ py: 1.75, px: 2, '&:last-child': { pb: 1.75 } }}>
        <Stack direction='row' alignItems='center' spacing={0.5}>
          <Typography sx={{ fontWeight: 800, fontSize: 15, color: colors.ink }}>
            {title}
          </Typography>
          {help ? (
            <Tooltip title={help} arrow>
              <HelpOutlineRoundedIcon sx={{ fontSize: 16, color: colors.muted }} />
            </Tooltip>
          ) : null}
        </Stack>
        <Typography
          sx={{
            fontWeight: 900,
            fontSize: { xs: 24, sm: 28 },
            color: colors.ink,
            lineHeight: 1.2,
            mt: 0.5,
          }}
        >
          {value}
          {suffix}
        </Typography>
      </CardContent>
    </Card>
  )
}

const insightsRequest = new Map()

function fetchTeacherInsights(source) {
  const key = source || 'rolling_level'
  if (!insightsRequest.has(key)) {
    const req = apiGet(`/api/teacher/insights?source=${encodeURIComponent(key)}`, {
      headers: teacherHeaders(),
    }).catch((err) => {
      insightsRequest.delete(key)
      throw err
    })
    insightsRequest.set(key, req)
  }
  return insightsRequest.get(key)
}

export default function TeacherClassInsights({
  source,
  summary,
  students,
  filterLabel,
  extraStats,
  sidePanel,
  children,
  hideKpis = false,
  hideTrend = false,
  hideAi = false,
}) {
  const theme = useTheme()
  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(true)
  const [metric, setMetric] = useState('englishRatio')
  const [aiLoading, setAiLoading] = useState(false)
  const [ai, setAi] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setAi(null)
    fetchTeacherInsights(source || 'rolling_level')
      .then((d) => {
        if (!cancelled) setInsights(d)
      })
      .catch(() => {
        if (!cancelled) setInsights({ stats: {}, timeseries: { labels: [] } })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [source])

  useEffect(() => {
    setAi(null)
  }, [filterLabel])

  const stats = insights?.stats || {}
  const ts = insights?.timeseries || { labels: [] }
  const compareTs = insights?.compareTimeseries
  const isCompareView = source === 'all'
  const isCompare = isCompareView && Array.isArray(compareTs?.labels)
  const labels = isCompare ? compareTs.labels || [] : ts.labels || []

  const lineSeries = useMemo(() => {
    const titles = {
      englishRatio: '英文佔比',
      lexicalRichness: '詞彙豐富度',
      avgTurns: '平均輪次',
      avgDurationMin: '平均時長',
    }
    const label = titles[metric] || titles.englishRatio
    const toY = (src) =>
      labels.map((_, i) => {
        const raw = src?.[i]
        if (raw == null || raw === '') return null
        const n = Number(raw)
        return Number.isFinite(n) ? n : null
      })

    if (isCompare) {
      const rollingY = toY(compareTs?.rolling_level?.[metric])
      const fixedY = toY(compareTs?.fixed_level?.[metric])
      const nums = [...rollingY, ...fixedY].filter((v) => v != null)
      let yMin
      let yMax
      if (nums.length) {
        const lo = Math.min(...nums)
        const hi = Math.max(...nums)
        const span = hi - lo
        const pad = span > 0 ? span * 0.18 : Math.max(Math.abs(hi) * 0.08, 0.08)
        yMin = lo - pad
        yMax = hi + pad
        if (metric === 'englishRatio' || metric === 'lexicalRichness') {
          yMin = Math.max(0, yMin)
        }
      }
      return { compare: true, rollingY, fixedY, label, yMin, yMax }
    }

    const raw = ts[metric]
    const y = toY(Array.isArray(raw) ? raw : [])
    const nums = y.filter((v) => v != null)
    let yMin
    let yMax
    if (nums.length) {
      const lo = Math.min(...nums)
      const hi = Math.max(...nums)
      const span = hi - lo
      const pad = span > 0 ? span * 0.18 : Math.max(Math.abs(hi) * 0.08, 0.08)
      yMin = lo - pad
      yMax = hi + pad
      if (metric === 'englishRatio' || metric === 'lexicalRichness') {
        yMin = Math.max(0, yMin)
      }
    }
    return { compare: false, y, label, yMin, yMax }
  }, [ts, compareTs, isCompare, metric, labels])

  const generateAi = async () => {
    setAiLoading(true)
    try {
      const res = await apiPost(
        '/api/teacher/ai-advice',
        {
          source,
          scoreLabel: filterLabel || null,
          students,
          stats,
          summary,
        },
        { headers: teacherHeaders() },
      )
      setAi(res)
    } catch (e) {
      setAi({
        ok: false,
        teaching: '',
        errors: '',
        rawText: String(e.message || e),
      })
    } finally {
      setAiLoading(false)
    }
  }

  const lineColor = theme.palette.primary.main
  const placeholder = filterLabel
    ? `依「${filterLabel}」產生建議`
    : '按右上按鈕產生全班建議'

  const languageCards = [
    {
      title: '英文佔比',
      value: loading ? '—' : Math.round(safeNum(stats.englishRatio) * 100),
      suffix: '%',
      help: '學生發言中，英文字相對漢字的比例。',
    },
    {
      title: '詞彙豐富度',
      value: loading ? '—' : safeNum(stats.lexicalRichness).toFixed(2),
      help: '獨特英文詞 / 總詞數。',
    },
    {
      title: '平均輪次',
      value: loading ? '—' : safeNum(stats.avgTurns),
      help: '每次對話平均來回次數。',
    },
    {
      title: '平均時長',
      value: loading ? '—' : safeNum(stats.avgDurationMin),
      suffix: ' 分',
      help: '每次對話平均有效時間。',
    },
  ]

  return (
    <Stack spacing={2}>
      {hideKpis ? null : (
      <Grid container spacing={1.5}>
        {languageCards.map((card) => (
          <Grid key={card.title} item size={{ xs: 6, md: 3 }}>
            <StatCard {...card} />
          </Grid>
        ))}
        {(extraStats || []).map((card) => (
          <Grid key={card.title} item size={{ xs: 6, md: 3 }}>
            <StatCard {...card} />
          </Grid>
        ))}
      </Grid>
      )}

      {hideTrend ? null : (
      <Grid container spacing={1.5} alignItems='stretch'>
        <Grid item size={{ xs: 12, md: sidePanel ? 7 : 12 }}>
          <Card variant='outlined' sx={panelSx}>
            <CardContent sx={panelBodySx}>
              <Stack
                direction='row'
                spacing={1}
                alignItems='center'
                justifyContent='space-between'
                flexWrap='wrap'
                useFlexGap
                sx={{ mb: 1 }}
              >
                <Typography sx={{ ...type.sectionTitle, fontSize: 18 }}>
                  {isCompareView ? '學習趨勢（兩組比較）' : '學習趨勢'}
                </Typography>
                <ToggleButtonGroup
                  size='small'
                  exclusive
                  value={metric}
                  onChange={(_, v) => v && setMetric(v)}
                  sx={{
                    gap: 0.5,
                    '& .MuiToggleButtonGroup-grouped': {
                      borderRadius: `${radii.btn}px !important`,
                      border: `1.5px solid ${colors.leaf} !important`,
                      marginLeft: '0 !important',
                    },
                    '& .MuiToggleButton-root': {
                      color: colors.leaf,
                      fontSize: 13,
                      fontWeight: 800,
                      px: 1.25,
                      py: 0.35,
                    },
                    '& .MuiToggleButton-root.Mui-selected': {
                      bgcolor: colors.leaf,
                      color: '#fff',
                    },
                  }}
                >
                  <ToggleButton value='englishRatio'>語言</ToggleButton>
                  <ToggleButton value='lexicalRichness'>豐富</ToggleButton>
                  <ToggleButton value='avgTurns'>互動</ToggleButton>
                  <ToggleButton value='avgDurationMin'>時長</ToggleButton>
                </ToggleButtonGroup>
              </Stack>

              {loading ? (
                <Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }}>
                  <CircularProgress />
                </Box>
              ) : labels.length === 0 ? (
                <Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }}>
                  <Typography sx={{ ...type.subtitle, fontSize: 15 }}>尚無對話資料</Typography>
                </Box>
              ) : (
                <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <Stack direction='row' spacing={1.5} alignItems='center' justifyContent='center' sx={{ mb: 0.5 }}>
                    {lineSeries.compare ? (
                      <CohortLegend />
                    ) : (
                      <>
                        <Box sx={{ width: 16, borderTop: `${CHART_LINE_WIDTH}px solid ${lineColor}` }} />
                        <Typography sx={{ fontWeight: 800, fontSize: 14, color: colors.ink }}>
                          {lineSeries.label}
                        </Typography>
                      </>
                    )}
                  </Stack>
                  <Box sx={{ flex: 1, minHeight: 220 }}>
                    <LineChart
                      skipAnimation
                      xAxis={[
                        {
                          scaleType: 'point',
                          data: labels,
                          valueFormatter: formatChartDay,
                          tickLabelStyle: { fontSize: 11 },
                        },
                      ]}
                      yAxis={[
                        {
                          min: lineSeries.yMin,
                          max: lineSeries.yMax,
                          tickLabelStyle: { fontSize: 11 },
                        },
                      ]}
                      series={
                        lineSeries.compare
                          ? COHORT_SERIES.map((c) => ({
                              id: c.id,
                              data: c.id === 'rolling' ? lineSeries.rollingY || [] : lineSeries.fixedY || [],
                              label: c.label,
                              color: c.color,
                              showMark: true,
                              curve: 'linear',
                              connectNulls: true,
                            }))
                          : [
                              {
                                data: lineSeries.y || [],
                                label: lineSeries.label,
                                color: lineColor,
                                showMark: true,
                                curve: 'linear',
                                connectNulls: false,
                              },
                            ]
                      }
                      height={260}
                      margin={{ left: 36, right: 12, top: 8, bottom: 32 }}
                      slots={{ legend: () => null }}
                      slotProps={{ legend: { hidden: true } }}
                      sx={{
                        width: '100%',
                        [`& .MuiLineElement-root`]: { strokeWidth: CHART_LINE_WIDTH },
                        ...(lineSeries.compare
                          ? {
                              [`& .MuiLineElement-series-rolling`]: {
                                stroke: `${colors.leaf} !important`,
                              },
                              [`& .MuiLineElement-series-fixed`]: {
                                stroke: `${colors.woodDark} !important`,
                                strokeDasharray: '8 5',
                              },
                              [`& .MuiMarkElement-series-rolling`]: {
                                fill: `${colors.leaf} !important`,
                                stroke: 'none !important',
                              },
                              [`& .MuiMarkElement-series-fixed`]: {
                                fill: `${colors.woodDark} !important`,
                                stroke: 'none !important',
                              },
                            }
                          : {
                              [`& .MuiLineElement-root`]: {
                                stroke: `${lineColor} !important`,
                                strokeWidth: CHART_LINE_WIDTH,
                              },
                              [`& .MuiMarkElement-root`]: {
                                fill: `${lineColor} !important`,
                                stroke: 'none !important',
                              },
                            }),
                      }}
                    />
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
        {sidePanel ? (
          <Grid item size={{ xs: 12, md: 5 }}>
            {sidePanel}
          </Grid>
        ) : null}
      </Grid>
      )}

      {children}

      {hideAi ? null : (
      <Grid container spacing={1.5} alignItems='stretch'>
        <Grid item size={{ xs: 12, md: 6 }}>
          <Card variant='outlined' sx={{ ...panelSx, height: { xs: 'auto', md: 220 } }}>
            <CardContent sx={panelBodySx}>
              <Stack direction='row' alignItems='center' justifyContent='space-between' gap={1} sx={{ mb: 1 }}>
                <Typography sx={{ ...type.sectionTitle, fontSize: 18 }}>
                  AI 教學總結
                </Typography>
                <Button
                  onClick={generateAi}
                  disabled={aiLoading}
                  startIcon={aiLoading ? null : <AutoAwesomeIcon />}
                  sx={{ ...buttonPrimarySx, px: 1.5, py: 0.5, fontSize: 13 }}
                >
                  {aiLoading ? '產生中…' : ai ? '重新產生' : '生成建議'}
                </Button>
              </Stack>
              <Typography sx={{ fontSize: 15, color: colors.ink, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                {ai?.teaching || placeholder}
              </Typography>
              {ai && !ai.ok && ai.rawText ? (
                <Typography sx={{ mt: 1, color: colors.error, fontSize: 13 }}>
                  {ai.rawText}
                </Typography>
              ) : null}
            </CardContent>
          </Card>
        </Grid>
        <Grid item size={{ xs: 12, md: 6 }}>
          <Card variant='outlined' sx={{ ...panelSx, height: { xs: 'auto', md: 220 } }}>
            <CardContent sx={panelBodySx}>
              <Typography sx={{ ...type.sectionTitle, fontSize: 18, mb: 1 }}>
                AI 常見錯誤
              </Typography>
              <Typography sx={{ fontSize: 15, color: colors.ink, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                {ai?.errors || '產生建議後顯示全班常見錯誤'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      )}
    </Stack>
  )
}
