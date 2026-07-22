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
  Avatar,
  TextField,
  MenuItem,
} from '@mui/material'
import clsx from 'clsx'
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import {
  ChartsLabelMark,
  ChartsTooltipCell,
  ChartsTooltipContainer,
  ChartsTooltipPaper,
  ChartsTooltipRow,
  ChartsTooltipTable,
  DEFAULT_X_AXIS_KEY,
  chartsTooltipClasses,
  useAxesTooltip,
} from '@mui/x-charts'
import { LineChart } from '@mui/x-charts/LineChart'
import { PieChart } from '@mui/x-charts/PieChart'
import { useTheme } from '@mui/material/styles'
import { apiGet } from '../lib/api'
import PracticeFitSummaryCard from '../components/PracticeFitSummaryCard'
import MyPracticePanel from '../components/MyPracticePanel'
import {
  filterActiveEarnedIds,
  getBadgesForSource,
  hasLegacyEarnedIds,
  isFixedLevelSource,
} from '../lib/badgeDefinitions'
import {
  cefrToTier,
  formatNextLevelLabel,
  groupCefrByTier,
  TIER_COLORS,
} from '../lib/levelDisplay'
import { radii, accordionCardSx, type } from '../theme/tokens'

/** 折線圖線寬（圖例與曲線必須相同） */
const CHART_LINE_WIDTH = 3

/** @param {import('@mui/material').Theme} theme */
function getChartLineSx(theme) {
  const lineColor = theme.palette.primary.main
  return {
    width: '100%',
    maxWidth: '100%',
    [`& .MuiLineElement-root`]: {
      stroke: `${lineColor} !important`,
      strokeWidth: CHART_LINE_WIDTH,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    // 實心小圓：略小於線寬，減少蓋住線段
    [`& .MuiMarkElement-root`]: {
      fill: `${lineColor} !important`,
      stroke: 'none !important',
      strokeWidth: '0 !important',
      r: 2.75,
    },
    // 避免繪圖區裁切線條上緣（頂部水平線會看起來變細）
    [`& .MuiChartsSurface-root, & svg`]: {
      overflow: 'visible',
    },
  }
}

function ChartSeriesLegend({ label, color }) {
  return (
    <Stack
      direction='row'
      spacing={0.75}
      alignItems='center'
      justifyContent='center'
      sx={{ width: '100%', mb: 0.5 }}
    >
      <Box
        component='span'
        sx={{
          width: 18,
          height: 0,
          borderTop: `${CHART_LINE_WIDTH}px solid`,
          borderColor: color,
          flexShrink: 0,
        }}
      />
      <Typography
        component='span'
        sx={{
          ...type.sectionTitle,
          fontSize: 14,
          lineHeight: 1.2,
        }}
      >
        {label}
      </Typography>
    </Stack>
  )
}
const CEFR_ORDER = ['PreA1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'C1C2']

// 與後端 /api/cefr/trends/daily 的 tz（預設 Asia/Taipei）對齊
const CEFR_TREND_TZ = 'Asia/Taipei'

/** `YYYY-MM-DD`（date input）→ 該日台北 0:00 的瞬間 */
function taipeiDayStartDate(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const d = new Date(`${ymd}T00:00:00+08:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** `YYYY-MM-DD` → 該日台北 23:59:59.999 */
function taipeiDayEndDate(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const d = new Date(`${ymd}T23:59:59.999+08:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * API / Mongo 常把「UTC 瞬間」序列化成無時區的 ISO（例如 `2026-05-11T04:19:56.931`）。
 * 若直接 new Date(s)，依 ES 規範會當「本地時區」解讀 → 在台灣會變成把 UTC 04:19 當台北 04:19，畫面永遠少 8 小時。
 * 僅在「含 T 的日期時間且字尾沒有 Z / ±offset」時強制當 UTC（加 Z）解析。
 */
function parseUtcLikeInstant(value) {
  if (value == null || value === '') return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  const s = String(value).trim()
  if (!s) return null
  const hasZone =
    /[zZ]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s) || /[+-]\d{4}$/.test(s)
  if (/^\d{4}-\d{2}-\d{2}T/.test(s) && !hasZone) {
    const d = new Date(`${s}Z`)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

// X 軸用 epoch ms + linear scale + Intl（Asia/Taipei）顯示；勿用 scaleType: time，否則在 OS=UTC 時 d3 tick 會顯示 04:xx。
const CEFR_TREND_RAW_AXIS_FMT = new Intl.DateTimeFormat('zh-TW', {
  timeZone: CEFR_TREND_TZ,
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})
const CEFR_TREND_DAILY_AXIS_FMT = new Intl.DateTimeFormat('zh-TW', {
  timeZone: CEFR_TREND_TZ,
  year: '2-digit',
  month: '2-digit',
  day: '2-digit',
})

function formatCefrTrendXAxis(mode, value) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return mode === 'raw'
    ? CEFR_TREND_RAW_AXIS_FMT.format(d)
    : CEFR_TREND_DAILY_AXIS_FMT.format(d)
}

/** DB 存 UTC 瞬間（或 ISO）；axis tooltip 的 axisValue 可能是 Date 或 epoch ms */
function formatCefrTrendAxisCaption(mode, axisValue, axisFormattedValue) {
  if (axisValue == null) return axisFormattedValue ?? ''
  if (axisValue instanceof Date) {
    return formatCefrTrendXAxis(mode, axisValue)
  }
  const n = Number(axisValue)
  if (Number.isFinite(n) && n > 1e11 && n < 1e14) {
    const d = new Date(n)
    if (!Number.isNaN(d.getTime())) return formatCefrTrendXAxis(mode, d)
  }
  return axisFormattedValue ?? ''
}

/** 與 MUI ChartsAxisTooltipContent 相同版面，但 caption 強制用台北時區（避免 axis tooltip 未帶到 valueFormatter） */
function CefrTaipeiAxisTooltipContent({ mode, sx }) {
  const tooltipData = useAxesTooltip()
  if (tooltipData === null) {
    return null
  }
  return (
    <ChartsTooltipPaper sx={sx} className={chartsTooltipClasses.paper}>
      {tooltipData.map(
        ({
          axisId,
          mainAxis,
          axisValue,
          axisFormattedValue,
          seriesItems,
        }) => {
          const caption = formatCefrTrendAxisCaption(
            mode,
            axisValue,
            axisFormattedValue,
          )
          return (
            <ChartsTooltipTable key={axisId} className={chartsTooltipClasses.table}>
              {axisValue != null && !mainAxis.hideTooltip && (
                <Typography component='caption'>{caption}</Typography>
              )}
              <tbody>
                {seriesItems.map(
                  ({
                    seriesId,
                    color,
                    formattedValue,
                    formattedLabel,
                    markType,
                  }) => {
                    if (formattedValue == null) {
                      return null
                    }
                    return (
                      <ChartsTooltipRow
                        key={seriesId}
                        className={chartsTooltipClasses.row}
                      >
                        <ChartsTooltipCell
                          className={clsx(
                            chartsTooltipClasses.labelCell,
                            chartsTooltipClasses.cell,
                          )}
                          component='th'
                        >
                          <div className={chartsTooltipClasses.markContainer}>
                            <ChartsLabelMark
                              type={markType}
                              color={color}
                              className={chartsTooltipClasses.mark}
                            />
                          </div>
                          {formattedLabel || null}
                        </ChartsTooltipCell>
                        <ChartsTooltipCell
                          className={clsx(
                            chartsTooltipClasses.valueCell,
                            chartsTooltipClasses.cell,
                          )}
                          component='td'
                        >
                          {formattedValue}
                        </ChartsTooltipCell>
                      </ChartsTooltipRow>
                    )
                  },
                )}
              </tbody>
            </ChartsTooltipTable>
          )
        },
      )}
    </ChartsTooltipPaper>
  )
}

// CEFR numeric (0~5) 畫線；Y 軸只顯示四大階，避免 A1/A2 都標「基礎」重複
const LEVEL_KEYS = ['PreA1', 'A1', 'A2', 'B1', 'B2', 'C1C2']
const CEFR_TREND_Y_TICKS = [0, 2, 4, 5]

function levelAxisTickFormat(v) {
  const n = Math.round(Number(v))
  if (Number.isNaN(n)) return ''
  if (n <= 0) return '入門'
  if (n <= 2) return '基礎'
  if (n <= 4) return '進階'
  return '高階'
}

const levelTickFormat = (v) => {
  const key = LEVEL_KEYS[Math.round(Number(v))]
  return key ? cefrToTier(key) : ''
}

function orderIndex(levelKey) {
  const i = CEFR_ORDER.indexOf(levelKey)
  return i === -1 ? 999 : i
}

function safeNum(n, fallback = 0) {
  const x = Number(n)
  return Number.isFinite(x) ? x : fallback
}

const fixedPanelSx = {
  borderRadius: `${radii.lg}px`,
  height: 360,
  display: 'flex',
  flexDirection: 'column',
}

const fixedContentSx = {
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
}

/** 徽章列表等需要捲動的內容區 */
const scrollableContentSx = {
  ...fixedContentSx,
  overflowY: 'auto',
  overflowX: 'hidden',
  pr: 0.5,
  '&::-webkit-scrollbar': {
    width: 8,
  },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 8,
  },
  '&::-webkit-scrollbar-track': {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 8,
  },
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
    <Card variant='outlined' sx={{ borderRadius: `${radii.lg}px`, height: '100%' }}>
      <CardContent>
        <Stack direction='row' alignItems='center' spacing={0.5}>
          <Typography sx={type.sectionTitle}>{title}</Typography>
          {help ? <InfoIcon title={help} /> : null}
        </Stack>

        <Typography
          sx={{
            fontWeight: 800,
            fontSize: { xs: 16, sm: 17 },
            color: 'text.primary',
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

// CEFR 趨勢圖（共用元件）
function CefrTrendChart({
  source,
  mongoUserId,
  assistantId = null,
  assistantName = '',
  mode = 'daily', // 'raw' | 'daily'
  start = null,
  end = null,
  height = 200,
  showAxisLabels = true,
}) {
  const [points, setPoints] = useState(null)
  const [err, setErr] = useState('')
  const theme = useTheme()

  useEffect(() => {
    if (!mongoUserId) return
    let cancelled = false

    const params = new URLSearchParams()
    params.set('user_id', mongoUserId)
    if (source) params.set('source', source)
    if (assistantId) params.set('assistant_id', assistantId)
    if (start) params.set('start', new Date(start).toISOString())
    if (end) params.set('end', new Date(end).toISOString())
    if (mode === 'daily') params.set('tz', CEFR_TREND_TZ)

    const path = mode === 'raw' ? '/api/cefr/trends' : '/api/cefr/trends/daily'

    setPoints(null)
    setErr('')

    apiGet(`${path}?${params.toString()}`)
      .then((d) => {
        if (cancelled) return
        if (mode === 'raw') {
          const arr = Array.isArray(d?.points) ? d.points : []
          setPoints(
            arr
              .filter((p) => p.ts != null && p.level != null)
              .map((p) => {
                const x = parseUtcLikeInstant(p.ts)
                return {
                  x: x ?? new Date(NaN),
                  y: Number(p.level),
                  levelKey: p.levelKey,
                  confidence: p.confidence,
                  assistantId: p.assistantId,
                  conversationId: p.conversationId,
                }
              })
              .filter((p) => p.x && !Number.isNaN(p.x.getTime())),
          )
        } else {
          const arr = Array.isArray(d?.series) ? d.series : []
          setPoints(
            arr
              .filter(
                (s) =>
                  s.date &&
                  s.value != null &&
                  taipeiDayStartDate(s.date) != null,
              )
              .map((s) => ({
                x: taipeiDayStartDate(s.date),
                y: Number(s.value),
                levelKey: s.levelKeyRounded,
                confidence: s.confidenceAvg,
                count: s.count,
                date: s.date,
              })),
          )
        }
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e))
      })

    return () => {
      cancelled = true
    }
  }, [source, mongoUserId, assistantId, mode, start, end])

  const xsMs = useMemo(
    () =>
      points == null
        ? []
        : points.map((p) =>
            p.x instanceof Date ? p.x.getTime() : Number(p.x),
          ),
    [points],
  )
  const ys = useMemo(
    () => (points == null ? [] : points.map((p) => p.y)),
    [points],
  )
  /** 點數不多時強制以資料時間為 tick；X 為 epoch ms + linear 軸，刻度一律走 valueFormatter + Intl 台北 */
  const xAxis = useMemo(() => {
    const maxDenseTicks = 48
    const maxSampledTicks = 24
    let tickInterval
    if (xsMs.length === 0) {
      tickInterval = undefined
    } else if (xsMs.length <= maxDenseTicks) {
      tickInterval = xsMs
    } else if (mode === 'raw') {
      const step = Math.max(1, Math.ceil(xsMs.length / maxSampledTicks))
      const picked = []
      for (let i = 0; i < xsMs.length; i += step) picked.push(xsMs[i])
      const last = xsMs[xsMs.length - 1]
      if (picked.length && picked[picked.length - 1] !== last) picked.push(last)
      tickInterval = picked
    } else {
      const step = Math.max(1, Math.ceil(xsMs.length / maxSampledTicks))
      const picked = []
      for (let i = 0; i < xsMs.length; i += step) picked.push(xsMs[i])
      const last = xsMs[xsMs.length - 1]
      if (picked.length && picked[picked.length - 1] !== last) picked.push(last)
      tickInterval = picked
    }
    return [
      {
        id: DEFAULT_X_AXIS_KEY,
        data: xsMs,
        scaleType: 'linear',
        tickInterval,
        valueFormatter: (v) => formatCefrTrendXAxis(mode, v),
      },
    ]
  }, [xsMs, mode])

  const cefrTrendTooltipSlot = useMemo(
    () =>
      function CefrTrendTooltipSlot(props) {
        return (
          <ChartsTooltipContainer {...props}>
            <CefrTaipeiAxisTooltipContent mode={mode} sx={props.sx} />
          </ChartsTooltipContainer>
        )
      },
    [mode],
  )

  if (err) {
    return (
      <Box sx={{ height, display: 'grid', placeItems: 'center' }}>
        <Typography variant='caption' color='error'>
          趨勢圖讀取失敗
        </Typography>
      </Box>
    )
  }

  if (points === null) {
    return (
      <Box sx={{ height, display: 'grid', placeItems: 'center' }}>
        <CircularProgress size={20} />
      </Box>
    )
  }

  if (points.length === 0) {
    return (
      <Box sx={{ height, display: 'grid', placeItems: 'center' }}>
        <Typography variant='caption' sx={{ opacity: 0.6 }}>
          目前沒有等級紀錄
        </Typography>
      </Box>
    )
  }

  return (
    <LineChart
      skipAnimation
      xAxis={xAxis}
        yAxis={[
          {
            min: 0,
            max: 5,
            tickInterval: CEFR_TREND_Y_TICKS,
            valueFormatter: levelAxisTickFormat,
          },
        ]}
      series={[
        {
          data: ys,
          xAxisId: DEFAULT_X_AXIS_KEY,
          label: assistantName || (assistantId ? '單一情境' : '整體'),
          color: theme.palette.primary.main,
          showMark: true,
          curve: 'linear',
          valueFormatter: (v, ctx) => {
            const idx = ctx?.dataIndex ?? 0
            const p = points[idx]
            if (!p) return String(v)
            const lk = cefrToTier(p.levelKey) || levelTickFormat(v)
            const conf =
              p.confidence != null
                ? ` (信心 ${Number(p.confidence).toFixed(2)})`
                : ''
            return `${lk}${conf}`
          },
        },
      ]}
      height={height}
      margin={{
        left: showAxisLabels ? 50 : 30,
        right: 16,
        top: 12,
        bottom: showAxisLabels ? 30 : 20,
      }}
      slots={{ tooltip: cefrTrendTooltipSlot }}
      slotProps={{ legend: { hidden: true } }}
      sx={getChartLineSx(theme)}
    />
  )
}

// CEFR 圓餅圖卡片
function CefrPieCard({ cefrGroups = [], loading }) {
  const theme = useTheme()

  const { seriesData, colors } = useMemo(() => {
    const tierGroups = groupCefrByTier(cefrGroups)
    const data = tierGroups.map((g, idx) => ({
      id: idx,
      value: g.assistants.length,
      label: g.tier,
    }))

    const chartColors = tierGroups.map(
      (g) => TIER_COLORS[g.tier] || theme.palette.grey[400],
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
    <Card variant='outlined' sx={fixedPanelSx}>
      <CardContent sx={fixedContentSx}>
        <Typography sx={{ ...type.sectionTitle, mb: 1 }}>
          等級分佈
        </Typography>
        {loading ? (
          <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              height: 280,
              px: 1,
            }}
          >
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
              width={200}
              height={220}
              slots={{ legend: () => null }}
              margin={{ top: 10, bottom: 10, left: 10, right: 10 }}
              sx={{
                '& .MuiChartsLegend-root': { display: 'none' },
              }}
            />
            <Stack spacing={1.25} sx={{ minWidth: 80 }}>
              {seriesData.map((item, i) => (
                <Stack
                  key={`legend-${item.id}-${item.label}`}
                  direction='row'
                  spacing={0.75}
                  alignItems='center'
                >
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      bgcolor: colors[i] || theme.palette.grey[400],
                      flexShrink: 0,
                      border: '1px solid',
                      borderColor: 'rgba(74,69,63,0.15)',
                    }}
                  />
                  <Typography
                    variant='body2'
                    sx={{ color: 'text.primary', fontWeight: 600 }}
                  >
                    {item.label}
                    <Typography
                      component='span'
                      variant='caption'
                      sx={{ color: 'text.secondary', ml: 0.5 }}
                    >
                      ({item.value})
                    </Typography>
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Box>
        )}
      </CardContent>
    </Card>
  )
}

function CefrColumn({ title, assistants = [], source, mongoUserId }) {
  return (
    <Box>
      <Typography
        sx={{ ...type.subsection, textAlign: 'center', mb: 1 }}
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
                  ...accordionCardSx,
                  border: '1px solid',
                  borderColor: 'divider',
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
                      <Chip
                        size='small'
                        label={`目前：${cefrToTier(a.levelKey)}`}
                      />
                    )}
                    {a.nextLevelKey && (
                      <Chip
                        size='small'
                        variant='outlined'
                        label={`下一階：${formatNextLevelLabel(a.levelKey, a.nextLevelKey)}`}
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

                  {mongoUserId && a.assistantId ? (
                    <Box sx={{ mb: 1 }}>
                      <Typography
                        variant='subtitle2'
                        sx={{ ...type.subsection, mb: 0.25 }}
                      >
                        等級趨勢
                      </Typography>
                      <CefrTrendChart
                        source={source}
                        mongoUserId={mongoUserId}
                        assistantId={a.assistantId}
                        assistantName={a.assistantName}
                        mode='raw'
                        height={160}
                        showAxisLabels
                      />
                    </Box>
                  ) : null}

                  {focus.length ? (
                    <>
                      <Typography
                        variant='subtitle2'
                        sx={{ ...type.subsection, mb: 0.5 }}
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

function BadgeAccordionPanel({
  stats = {},
  earnedIds = [],
  legacyEarnedIds = [],
  loading,
  source,
}) {
  const [filter, setFilter] = useState('all')

  const badges = useMemo(() => getBadgesForSource(source), [source])
  const activeEarnedIds = useMemo(
    () => filterActiveEarnedIds(earnedIds),
    [earnedIds],
  )
  const earnedSet = useMemo(() => new Set(activeEarnedIds), [activeEarnedIds])
  const showLegacyNote =
    legacyEarnedIds.length > 0 || hasLegacyEarnedIds(earnedIds)

  const earnedCount = badges.filter((b) => earnedSet.has(b.id)).length
  const totalCount = badges.length

  const filteredBadges = useMemo(() => {
    if (filter === 'earned') {
      return badges.filter((b) => earnedSet.has(b.id))
    }
    if (filter === 'locked') {
      return badges.filter((b) => !earnedSet.has(b.id))
    }
    return badges
  }, [filter, earnedSet, badges])

  return (
    <Card variant='outlined' sx={fixedPanelSx}>
      <CardContent sx={scrollableContentSx}>
        <Stack spacing={1.5}>
          <Stack
            direction='row'
            alignItems='center'
            justifyContent='space-between'
            flexWrap='wrap'
            useFlexGap
          >
            <Box>
              <Typography sx={type.sectionTitle}>
                徽章總覽
              </Typography>
              <Typography sx={type.subtitle}>
                對齊口說成績標準 · 已獲得 {earnedCount} / {totalCount}
              </Typography>
              {showLegacyNote ? (
                <Typography
                  variant='caption'
                  sx={{ opacity: 0.55, display: 'block', mt: 0.25 }}
                >
                  帳號含舊版獎章紀錄，現行制度以 6 枚成績獎章為準
                </Typography>
              ) : null}
            </Box>

            <ToggleButtonGroup
              size='small'
              value={filter}
              exclusive
              onChange={(_, v) => v && setFilter(v)}
              sx={{
                gap: 0.75,
                '& .MuiToggleButtonGroup-grouped': {
                  borderRadius: `${radii.btn}px !important`,
                  border: '1px solid !important',
                  borderColor: 'primary.main !important',
                  marginLeft: '0 !important',
                },
                '& .MuiToggleButton-root': {
                  color: 'primary.main',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  py: 0.5,
                  width: 60,
                  '&:hover': { bgcolor: 'action.hover' },
                },
                '& .MuiToggleButton-root.Mui-selected': {
                  bgcolor: 'primary.main',
                  color: '#fff',
                  '&:hover': { bgcolor: 'primary.dark' },
                },
              }}
            >
              <ToggleButton value='all'>全部</ToggleButton>
              <ToggleButton value='earned'>已獲得</ToggleButton>
              <ToggleButton value='locked'>未獲得</ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          {loading ? (
            <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}>
              <CircularProgress />
            </Box>
          ) : filteredBadges.length === 0 ? (
            <Typography variant='body2' sx={{ opacity: 0.7, py: 2 }}>
              目前沒有符合條件的徽章
            </Typography>
          ) : (
            <Stack spacing={1.2}>
              {filteredBadges.map((badge) => {
                const earned = earnedSet.has(badge.id)
                const progressText =
                  typeof badge.progress === 'function'
                    ? badge.progress(stats)
                    : '—'
                const remainingText =
                  typeof badge.remainingText === 'function'
                    ? badge.remainingText(stats)
                    : '尚未達成'

                return (
                  <Accordion
                    key={badge.id}
                    disableGutters
                    elevation={0}
                    sx={{
                      ...accordionCardSx,
                      border: '1px solid',
                      borderColor: earned ? 'primary.main' : 'divider',
                      bgcolor: earned ? 'primary.light' : 'grey.50',
                    }}
                  >
                    <AccordionSummary
                      expandIcon={<ExpandMoreRoundedIcon />}
                      sx={{
                        minHeight: 72,
                        '& .MuiAccordionSummary-content': {
                          my: 1,
                        },
                      }}
                    >
                      <Stack
                        direction='row'
                        spacing={1.5}
                        alignItems='center'
                        sx={{ width: '100%' }}
                      >
                        <Avatar
                          sx={{
                            width: 48,
                            height: 48,
                            fontSize: earned ? 24 : 28,
                            bgcolor: 'grey.200',
                            color: earned ? '#fff' : 'text.primary',
                            border: '1px solid',
                            borderColor: 'grey.300',
                          }}
                        >
                          {earned ? badge.icon : '?'}
                        </Avatar>

                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Stack
                            direction='row'
                            spacing={1}
                            alignItems='center'
                            useFlexGap
                            flexWrap='wrap'
                          >
                            <Typography
                              variant='subtitle1'
                              sx={{ fontWeight: 800, color: 'text.primary' }}
                            >
                              {badge.name}
                            </Typography>
                            <Chip
                              size='small'
                              color={earned ? 'success' : 'default'}
                              label={earned ? '已獲得' : '未獲得'}
                            />
                          </Stack>

                          <Typography
                            variant='body2'
                            sx={{ opacity: 0.72, mt: 0.25 }}
                          >
                            {earned ? '已解鎖此徽章' : remainingText}
                          </Typography>
                        </Box>
                      </Stack>
                    </AccordionSummary>

                    <AccordionDetails sx={{ pt: 0.5 }}>
                      <Stack spacing={0.75}>
                        <Typography variant='body2'>
                          <b>徽章名稱：</b> {badge.name}
                        </Typography>
                        <Typography variant='body2'>
                          <b>徽章意義：</b> {badge.meaning}
                        </Typography>
                        <Typography variant='body2'>
                          <b>解鎖條件：</b> {badge.unlock}
                        </Typography>
                        {badge.gradeNote ? (
                          <Typography variant='body2' sx={{ opacity: 0.75 }}>
                            <b>成績對應：</b> {badge.gradeNote}
                          </Typography>
                        ) : null}
                        <Typography variant='body2'>
                          <b>目前進度：</b> {earned ? '已達成' : progressText}
                        </Typography>

                        {!earned ? (
                          <Typography
                            variant='body2'
                            sx={{ fontWeight: 700, color: 'warning.main' }}
                          >
                            <b>尚差：</b> {remainingText}
                          </Typography>
                        ) : (
                          <Typography
                            variant='body2'
                            sx={{ fontWeight: 700, color: 'success.main' }}
                          >
                            已成功獲得此徽章
                          </Typography>
                        )}
                      </Stack>
                    </AccordionDetails>
                  </Accordion>
                )
              })}
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}

// 整體 CEFR 趨勢圖內容（含 Raw/Daily 切換、Assistant 篩選、日期範圍）
function OverallCefrTrendContent({
  source,
  mongoUserId,
  assistantOptions = [],
  loading,
  showHeader = true,
}) {
  const [mode, setMode] = useState('daily')
  const [assistantId, setAssistantId] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  const startIso = useMemo(() => {
    const d = taipeiDayStartDate(start)
    return d ? d.toISOString() : null
  }, [start])

  const endIso = useMemo(() => {
    const d = taipeiDayEndDate(end)
    return d ? d.toISOString() : null
  }, [end])

  const selectedAssistantName = useMemo(() => {
    if (!assistantId) return ''
    const found = assistantOptions.find((o) => o.assistantId === assistantId)
    return found?.assistantName || ''
  }, [assistantId, assistantOptions])

  const modeToggle = (
    <ToggleButtonGroup
      size='small'
      value={mode}
      exclusive
      onChange={(_, v) => v && setMode(v)}
      sx={{
        gap: 0.75,
        '& .MuiToggleButtonGroup-grouped': {
          borderRadius: `${radii.btn}px !important`,
          border: '1px solid !important',
          borderColor: 'primary.main !important',
          marginLeft: '0 !important',
        },
        '& .MuiToggleButton-root': {
          color: 'primary.main',
          fontSize: '0.75rem',
          fontWeight: 700,
          py: 0.5,
          px: 1.5,
        },
        '& .MuiToggleButton-root.Mui-selected': {
          bgcolor: 'primary.main',
          color: '#fff',
          '&:hover': { bgcolor: 'primary.dark' },
        },
      }}
    >
      <ToggleButton value='daily'>Daily</ToggleButton>
      <ToggleButton value='raw'>Raw</ToggleButton>
    </ToggleButtonGroup>
  )

  const otherFilters = (
    <Stack
      direction='row'
      spacing={1}
      alignItems='center'
      useFlexGap
      flexWrap='wrap'
    >
      <TextField
        select
        size='small'
        id='assistant'
        name='assistant'
        label='Assistant'
        value={assistantId}
        onChange={(e) => setAssistantId(e.target.value)}
        sx={{ minWidth: 180 }}
        InputLabelProps={{ shrink: true }}
        SelectProps={{
          displayEmpty: true,
          inputProps: { id: 'assistant', name: 'assistant' },
          renderValue: (v) => {
            if (!v) return '整體'
            return selectedAssistantName || '單一情境'
          },
        }}
      >
        <MenuItem value=''>整體</MenuItem>
        {assistantOptions.map((opt) => (
          <MenuItem key={opt.assistantId} value={opt.assistantId}>
            {opt.assistantName || opt.assistantId}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        size='small'
        id='startDate'
        name='startDate'
        label='起'
        type='date'
        value={start}
        onChange={(e) => setStart(e.target.value)}
        InputLabelProps={{ shrink: true }}
        sx={{ minWidth: 140 }}
      />
      <TextField
        size='small'
        id='endDate'
        name='endDate'
        label='迄'
        type='date'
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        InputLabelProps={{ shrink: true }}
        sx={{ minWidth: 140 }}
      />
    </Stack>
  )

  const filters = (
    <Stack
      direction='row'
      spacing={1}
      alignItems='center'
      justifyContent='space-between'
      useFlexGap
      flexWrap='wrap'
      sx={{ width: '100%' }}
    >
      {modeToggle}
      {otherFilters}
    </Stack>
  )

  return (
    <Box>
      {showHeader ? (
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          alignItems={{ xs: 'flex-start', md: 'center' }}
          justifyContent='space-between'
          spacing={1.5}
          sx={{ mb: 1.5 }}
          useFlexGap
          flexWrap='wrap'
        >
          <Box>
            <Typography sx={type.sectionTitle}>整體等級趨勢</Typography>
            <Typography sx={type.subtitle}>
              依時間追蹤學生的等級變化
            </Typography>
          </Box>
          {filters}
        </Stack>
      ) : (
        <Box sx={{ mb: 1.5 }}>{filters}</Box>
      )}

      {showHeader ? <Divider sx={{ mb: 1.5 }} /> : null}

      {loading || !mongoUserId ? (
        <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}>
          <CircularProgress />
        </Box>
      ) : (
        <CefrTrendChart
          source={source}
          mongoUserId={mongoUserId}
          assistantId={assistantId || null}
          assistantName={selectedAssistantName}
          mode={mode}
          start={startIso}
          end={endIso}
          height={300}
          showAxisLabels
        />
      )}
    </Box>
  )
}

function CefrAdviceContent({
  loading,
  tierGroups = [],
  source,
  mongoUserId,
}) {
  if (loading) {
    return (
      <Box sx={{ py: 3, display: 'grid', placeItems: 'center' }}>
        <CircularProgress size={22} />
      </Box>
    )
  }

  return (
    <Grid container spacing={2}>
      {tierGroups.map((g) => (
        <Grid key={g.tier} item size={{ xs: 12, sm: 6, lg: 4 }}>
          <CefrColumn
            title={g.title}
            assistants={g.assistants}
            source={source}
            mongoUserId={mongoUserId}
          />
        </Grid>
      ))}
      {!tierGroups.length && (
        <Grid item xs={12}>
          <Typography variant='body2' sx={{ opacity: 0.7 }}>
            目前沒有建議資料
          </Typography>
        </Grid>
      )}
    </Grid>
  )
}

/** 整體等級趨勢 / 詳細建議：同一卡片分頁切換 */
function LevelInsightCard({
  source,
  mongoUserId,
  assistantOptions = [],
  loading,
  tierGroups = [],
  showTrend = true,
  showAdvice = true,
}) {
  const tabs = useMemo(() => {
    const list = []
    if (showTrend) list.push({ id: 'trend', label: '整體等級趨勢' })
    if (showAdvice) list.push({ id: 'advice', label: '詳細建議' })
    return list
  }, [showTrend, showAdvice])

  const [tab, setTab] = useState(tabs[0]?.id || 'trend')

  useEffect(() => {
    if (!tabs.length) return
    if (!tabs.some((t) => t.id === tab)) setTab(tabs[0].id)
  }, [tabs, tab])

  if (!tabs.length) return null

  const subtitle =
    tab === 'advice'
      ? '根據各情境表現分析（含每個情境的等級趨勢圖）'
      : '依時間追蹤學生的等級變化'

  return (
    <Card variant='outlined' sx={{ borderRadius: `${radii.lg}px` }}>
      <CardContent>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          justifyContent='space-between'
          spacing={1.25}
          sx={{ mb: 1 }}
          useFlexGap
          flexWrap='wrap'
        >
          <Stack spacing={0.75}>
            {tabs.length > 1 ? (
              <Stack direction='row' spacing={0} alignItems='flex-end'>
                {tabs.map((t) => {
                  const selected = tab === t.id
                  return (
                    <Box
                      key={t.id}
                      component='button'
                      type='button'
                      onClick={() => setTab(t.id)}
                      sx={{
                        appearance: 'none',
                        border: 0,
                        background: 'transparent',
                        cursor: 'pointer',
                        px: 0.25,
                        mr: 2.5,
                        pb: 0.75,
                        ...type.sectionTitle,
                        color: selected ? 'text.primary' : 'text.secondary',
                        borderBottom: '2.5px solid',
                        borderColor: selected ? 'primary.main' : 'transparent',
                        transition: 'color 0.15s, border-color 0.15s',
                        '&:hover': {
                          color: 'text.primary',
                        },
                      }}
                    >
                      {t.label}
                    </Box>
                  )
                })}
              </Stack>
            ) : (
              <Typography sx={type.sectionTitle}>{tabs[0].label}</Typography>
            )}
            <Typography sx={type.subtitle}>{subtitle}</Typography>
          </Stack>
        </Stack>

        <Divider sx={{ my: 1.5 }} />

        {tab === 'trend' ? (
          <OverallCefrTrendContent
            source={source}
            mongoUserId={mongoUserId}
            assistantOptions={assistantOptions}
            loading={loading}
            showHeader={false}
          />
        ) : (
          <CefrAdviceContent
            loading={loading}
            tierGroups={tierGroups}
            source={source}
            mongoUserId={mongoUserId}
          />
        )}
      </CardContent>
    </Card>
  )
}

/** ---------- page ---------- */
export default function Overview({
  showOverallCefrTrend = true,
  showCefrAdvice = true,
  useScenarioLevels = false,
  fixedLevelErrorHint = false,
}) {
  const { source, hfUserId } = useParams()
  const theme = useTheme()

  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [metric, setMetric] = useState('englishRatio')

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
  const badgeStats = data?.badge?.stats ?? {}
  const mongoUserId = data?.mongoUserId || ''
  const earnedBadgeIds = data?.badge?.earnedIds ?? []
  const legacyBadgeIds = data?.badge?.legacyEarnedIds ?? []
  const ts = data?.timeseries ?? { labels: [] }
  const labels = ts.labels ?? []

  const lineSeries = useMemo(() => {
    const mapping = {
      englishRatio: { y: ts.englishRatio, label: '英文佔比' },
      lexicalRichness: { y: ts.lexicalRichness, label: '詞彙豐富度' },
      avgTurns: { y: ts.avgTurns, label: '平均輪次' },
      avgDurationMin: { y: ts.avgDurationMin, label: '平均時長(分)' },
    }
    const raw = mapping[metric] || mapping.englishRatio
    const src = Array.isArray(raw.y) ? raw.y : []
    // 與 labels 對齊，避免曲線與圓點錯位
    const y = labels.map((_, i) => {
      const n = Number(src[i])
      return Number.isFinite(n) ? n : null
    })
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
      // 比例類指標不要低於 0
      if (metric === 'englishRatio' || metric === 'lexicalRichness') {
        yMin = Math.max(0, yMin)
      }
    }
    return { y, label: raw.label, yMin, yMax }
  }, [ts, metric, labels])

  const cefrGroups = useMemo(() => {
    const arr = Array.isArray(data?.cefrGroups) ? data.cefrGroups : []
    return [...arr].sort(
      (a, b) => orderIndex(a.levelKey) - orderIndex(b.levelKey),
    )
  }, [data])

  const tierGroups = useMemo(
    () => groupCefrByTier(cefrGroups),
    [cefrGroups],
  )

  const recentPractice = useMemo(() => {
    const arr = Array.isArray(data?.recentPractice) ? data.recentPractice : []
    return arr
  }, [data])

  // 整體趨勢圖的 assistant 下拉：去重後的 (assistantId, assistantName)
  const assistantOptions = useMemo(() => {
    const map = new Map()
    cefrGroups.forEach((g) => {
      ;(g.assistants || []).forEach((a) => {
        if (a.assistantId && !map.has(a.assistantId)) {
          map.set(a.assistantId, {
            assistantId: a.assistantId,
            assistantName: a.assistantName || a.assistantId,
          })
        }
      })
    })
    return Array.from(map.values())
  }, [cefrGroups])

  if (err) {
    const userMissing =
      /user not found/i.test(err) || /找不到/i.test(err)
    return (
      <Card variant='outlined'>
        <CardContent>
          <Typography variant='h6' color='error'>
            讀取失敗
          </Typography>
          <Typography sx={{ whiteSpace: 'pre-wrap', mt: 1 }}>{err}</Typography>
          {fixedLevelErrorHint && userMissing ? (
            <Typography variant='body2' sx={{ mt: 2, opacity: 0.85 }}>
              fixed_level（固定等級系統）讀取的是資料庫{' '}
              <code>FIXED_LEVEL_MONGO_DB</code>
              （預設 <code>chat-ui-control</code>）。若該 hfUserId 只在{' '}
              <code>rolling_level</code>（滾動式調整系統，預設 <code>chat-ui</code>
              ）存在，請改選 rolling_level，或在 fixed_level 對應庫的{' '}
              <code>users</code> 集合確認是否有對應的 hfUserId。
            </Typography>
          ) : null}
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
          <Card variant='outlined' sx={fixedPanelSx}>
            <CardContent sx={fixedContentSx}>
              <Stack spacing={1} sx={{ mb: 1, flexShrink: 0 }}>
                <Typography sx={type.sectionTitle}>
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
                    gap: 0.75,
                    '& .MuiToggleButtonGroup-grouped': {
                      borderRadius: `${radii.btn}px !important`,
                      border: '1px solid !important',
                      borderColor: 'primary.main !important',
                      marginLeft: '0 !important',
                    },
                    '& .MuiToggleButton-root': {
                      color: 'primary.main',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      py: 0.5,
                      '&:hover': { bgcolor: 'action.hover' },
                    },
                    '& .MuiToggleButton-root.Mui-selected': {
                      bgcolor: 'primary.main',
                      color: '#fff',
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
                <Box
                  sx={{
                    flex: 1,
                    display: 'grid',
                    placeItems: 'center',
                    minHeight: 0,
                  }}
                >
                  <CircularProgress />
                </Box>
              ) : (
                <Box
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    justifyContent: 'center',
                  }}
                >
                  <ChartSeriesLegend
                    label={lineSeries.label}
                    color={theme.palette.primary.main}
                  />
                  <Box
                    sx={{
                      width: '100%',
                      ml: -1,
                      mr: 0.5,
                    }}
                  >
                    <LineChart
                      skipAnimation
                      xAxis={[{ scaleType: 'point', data: labels }]}
                      yAxis={[
                        {
                          min: lineSeries.yMin,
                          max: lineSeries.yMax,
                          tickLabelStyle: { fontSize: 11 },
                        },
                      ]}
                      series={[
                        {
                          data: lineSeries.y || [],
                          label: lineSeries.label,
                          color: theme.palette.primary.main,
                          showMark: true,
                          curve: 'linear',
                          connectNulls: false,
                        },
                      ]}
                      height={200}
                      // 左窄右寬：補償 Y 軸刻度佔位，讓繪圖區視覺置中（避免偏右）
                      margin={{ left: 28, right: 12, top: 16, bottom: 28 }}
                      slots={{ legend: () => null }}
                      slotProps={{ legend: { hidden: true } }}
                      sx={getChartLineSx(theme)}
                    />
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* 圖表 B: fixed_level 適配概況 / rolling_level 等級分佈 */}
        <Grid item size={{ xs: 12, md: 4 }}>
          {useScenarioLevels ? (
            <PracticeFitSummaryCard
              recentPractice={recentPractice}
              loading={loading}
            />
          ) : (
            <CefrPieCard cefrGroups={cefrGroups} loading={loading} />
          )}
        </Grid>

        {/* 圖表 C: 徽章總覽 */}
        <Grid item size={{ xs: 12, md: 4 }}>
          <BadgeAccordionPanel
            stats={badgeStats}
            earnedIds={earnedBadgeIds}
            legacyEarnedIds={legacyBadgeIds}
            loading={loading}
            source={source}
          />
        </Grid>
      </Grid>

      {useScenarioLevels ? (
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item size={{ xs: 12 }}>
            <MyPracticePanel
              recentPractice={recentPractice}
              loading={loading}
              source={source}
              mongoUserId={mongoUserId}
            />
          </Grid>
        </Grid>
      ) : null}

      {showOverallCefrTrend || showCefrAdvice ? (
        <Grid container spacing={2}>
          <Grid item size={{ xs: 12 }}>
            <LevelInsightCard
              source={source}
              mongoUserId={mongoUserId}
              assistantOptions={assistantOptions}
              loading={loading}
              tierGroups={tierGroups}
              showTrend={showOverallCefrTrend}
              showAdvice={showCefrAdvice}
            />
          </Grid>
        </Grid>
      ) : null}
    </Box>
  )
}
