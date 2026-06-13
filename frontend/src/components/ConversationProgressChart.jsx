import { useCallback, useEffect, useMemo, useState } from 'react'
import { Box, CircularProgress, Stack, Typography } from '@mui/material'
import clsx from 'clsx'
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
import { apiGet } from '../lib/api'
import {
  cefrToTier,
  classifyPracticeFit,
  FIT_MATCH_COLOR,
  FIT_UNMATCH_COLOR,
  formatFitStatus,
} from '../lib/levelDisplay'

const PROGRESS_CHART_TZ = 'Asia/Taipei'
const PROGRESS_AXIS_FMT = new Intl.DateTimeFormat('zh-TW', {
  timeZone: PROGRESS_CHART_TZ,
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})

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

function formatProgressXAxis(value) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return PROGRESS_AXIS_FMT.format(d)
}

function fitColor(matched) {
  return matched ? FIT_MATCH_COLOR : FIT_UNMATCH_COLOR
}

function FitProgressTooltipContent({ sx }) {
  const tooltipData = useAxesTooltip()
  if (tooltipData === null) return null

  return (
    <ChartsTooltipPaper sx={sx} className={chartsTooltipClasses.paper}>
      {tooltipData.map(({ axisId, axisFormattedValue, seriesItems }) => {
        const pointItem = seriesItems.find((s) =>
          String(s.seriesId).startsWith('point-'),
        )
        if (!pointItem?.formattedValue) return null

        return (
          <ChartsTooltipTable key={axisId} className={chartsTooltipClasses.table}>
            {axisFormattedValue != null ? (
              <Typography component='caption'>{axisFormattedValue}</Typography>
            ) : null}
            <tbody>
              <ChartsTooltipRow className={chartsTooltipClasses.row}>
                <ChartsTooltipCell
                  className={clsx(
                    chartsTooltipClasses.labelCell,
                    chartsTooltipClasses.cell,
                  )}
                  component='th'
                >
                  <div className={chartsTooltipClasses.markContainer}>
                    <ChartsLabelMark
                      type={pointItem.markType}
                      color={pointItem.color}
                      className={chartsTooltipClasses.mark}
                    />
                  </div>
                </ChartsTooltipCell>
                <ChartsTooltipCell
                  className={clsx(
                    chartsTooltipClasses.valueCell,
                    chartsTooltipClasses.cell,
                  )}
                  component='td'
                >
                  {pointItem.formattedValue}
                </ChartsTooltipCell>
              </ChartsTooltipRow>
            </tbody>
          </ChartsTooltipTable>
        )
      })}
    </ChartsTooltipPaper>
  )
}

function FitProgressTooltipSlot(props) {
  return (
    <ChartsTooltipContainer {...props}>
      <FitProgressTooltipContent sx={props.sx} />
    </ChartsTooltipContainer>
  )
}

export default function ConversationProgressChart({
  source,
  mongoUserId,
  conversationId,
  targetProductTier = '',
  height = 160,
}) {
  const [points, setPoints] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!mongoUserId || !conversationId) return
    let cancelled = false

    const params = new URLSearchParams()
    params.set('user_id', mongoUserId)
    params.set('conversation_id', conversationId)
    if (source) params.set('source', source)

    setPoints(null)
    setErr('')

    apiGet(`/api/cefr/trends?${params.toString()}`)
      .then((d) => {
        if (cancelled) return
        const arr = Array.isArray(d?.points) ? d.points : []
        const mapped = arr
          .map((p) => {
            const x = parseUtcLikeInstant(p.ts)
            if (!x) return null
            const matched = classifyPracticeFit(p.fitStatus) === 'matched'
            return {
              xMs: x.getTime(),
              y: matched ? 1 : 0,
              matched,
              levelKey: p.levelKey,
              fitStatus: p.fitStatus,
              confidence: p.confidence,
            }
          })
          .filter(Boolean)
        mapped.sort((a, b) => a.xMs - b.xMs)
        setPoints(mapped)
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e))
      })

    return () => {
      cancelled = true
    }
  }, [source, mongoUserId, conversationId])

  const xsMs = useMemo(
    () => (points == null ? [] : points.map((p) => p.xMs)),
    [points],
  )

  const xAxis = useMemo(() => {
    let tickInterval
    if (xsMs.length === 0) {
      tickInterval = undefined
    } else if (xsMs.length <= 12) {
      tickInterval = xsMs
    } else {
      const step = Math.max(1, Math.ceil(xsMs.length / 8))
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
        valueFormatter: formatProgressXAxis,
        label: '時間',
      },
    ]
  }, [xsMs])

  const tooltipFormatter = useCallback(
    (_v, ctx) => {
      const idx = ctx?.dataIndex ?? 0
      const p = points?.[idx]
      if (!p) return ''
      const fitLabel = p.matched ? '符合選定等級' : '不符合選定等級'
      const tier = p.levelKey ? cefrToTier(p.levelKey) : ''
      const detail = p.fitStatus ? formatFitStatus(p.fitStatus) : ''
      const conf =
        p.confidence != null
          ? ` · 信心 ${Number(p.confidence).toFixed(2)}`
          : ''
      return `${fitLabel}${tier ? `（表現：${tier}）` : ''}${detail ? ` · ${detail}` : ''}${conf}`
    },
    [points],
  )

  const chartSeries = useMemo(() => {
    if (!points || points.length < 2) return []

    const n = points.length
    const series = []

    for (let i = 0; i < n - 1; i += 1) {
      const data = Array(n).fill(null)
      data[i] = points[i].y
      data[i + 1] = points[i + 1].y
      series.push({
        id: `segment-${i}`,
        data,
        xAxisId: DEFAULT_X_AXIS_KEY,
        color: fitColor(points[i + 1].matched),
        showMark: false,
        connectNulls: false,
        curve: 'linear',
      })
    }

    for (let i = 0; i < n; i += 1) {
      const data = Array(n).fill(null)
      data[i] = points[i].y
      series.push({
        id: `point-${i}`,
        data,
        xAxisId: DEFAULT_X_AXIS_KEY,
        color: fitColor(points[i].matched),
        showMark: true,
        connectNulls: false,
        curve: 'linear',
        valueFormatter: tooltipFormatter,
      })
    }

    return series
  }, [points, tooltipFormatter])

  if (err) {
    return (
      <Box sx={{ height, display: 'grid', placeItems: 'center' }}>
        <Typography variant='caption' color='error'>
          進步圖讀取失敗
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

  if (points.length < 2) {
    return (
      <Box sx={{ height, display: 'grid', placeItems: 'center' }}>
        <Typography variant='caption' sx={{ opacity: 0.6 }}>
          尚無足夠評估紀錄（需至少 2 個時間節點）
        </Typography>
      </Box>
    )
  }

  return (
    <Box>
      {targetProductTier ? (
        <Typography
          variant='caption'
          sx={{ opacity: 0.65, display: 'block', mb: 0.5 }}
        >
          選擇等級：{targetProductTier}
        </Typography>
      ) : null}
      <LineChart
        xAxis={xAxis}
        yAxis={[
          {
            min: -0.1,
            max: 1.1,
            tickInterval: [0, 1],
            valueFormatter: (v) => (Number(v) >= 0.5 ? '符合' : '不符合'),
          },
        ]}
        series={chartSeries}
        height={height}
        margin={{ left: 52, right: 16, top: 8, bottom: 40 }}
        slots={{ tooltip: FitProgressTooltipSlot }}
        slotProps={{ legend: { hidden: true } }}
        sx={{
          '& .MuiChartsAxis-directionY .MuiChartsAxis-tickContainer:first-of-type .MuiChartsAxis-tickLabel':
            {
              fill: FIT_UNMATCH_COLOR,
              fontWeight: 600,
            },
          '& .MuiChartsAxis-directionY .MuiChartsAxis-tickContainer:last-of-type .MuiChartsAxis-tickLabel':
            {
              fill: FIT_MATCH_COLOR,
              fontWeight: 600,
            },
        }}
      />
      <Stack direction='row' spacing={2} justifyContent='center' sx={{ mt: 0.5 }}>
        <Typography variant='caption' sx={{ color: FIT_MATCH_COLOR }}>
          ● 符合
        </Typography>
        <Typography variant='caption' sx={{ color: FIT_UNMATCH_COLOR }}>
          ● 不符合
        </Typography>
      </Stack>
    </Box>
  )
}
