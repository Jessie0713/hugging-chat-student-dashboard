// src/components/DonutUsageCard.jsx
import React, { useMemo, useState } from 'react'
import { Box, Card, CardContent, Paper, Stack, Typography } from '@mui/material'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'

const DEFAULT_COLORS = [
  '#4F6FEA', // 藍
  '#F4C145', // 黃
  '#3AD29F', // 綠
  '#9B7CF6',
  '#FF7AA2',
  '#6BCBFF',
  '#A3A3A3',
]

function fmtPct(x) {
  if (!Number.isFinite(x)) return '0.00'
  return x.toFixed(2)
}

function DonutTooltip({ active, payload, total }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  const value = Number(d?.value ?? 0)
  const pct = total > 0 ? (value / total) * 100 : 0

  return (
    <Paper elevation={4} sx={{ px: 1.25, py: 0.75, borderRadius: 2 }}>
      <Typography variant='body2' sx={{ fontWeight: 700 }}>
        {d?.name ?? '-'}：{value}次 ({fmtPct(pct)}%)
      </Typography>
    </Paper>
  )
}

/**
 * data: [{ name: string, value: number }]
 * title: string
 */
export default function DonutUsageCard({
  title = '常用聊天情境',
  data = [],
  height = 260,
  colors = DEFAULT_COLORS,
}) {
  const [activeIndex, setActiveIndex] = useState(null)

  const safeData = useMemo(() => {
    // 避免 value 不是數字
    return (Array.isArray(data) ? data : [])
      .map((d) => ({ name: d?.name ?? '-', value: Number(d?.value ?? 0) }))
      .filter((d) => d.value > 0)
  }, [data])

  const total = useMemo(
    () => safeData.reduce((s, d) => s + d.value, 0),
    [safeData],
  )

  // 預設中心顯示「最大那塊」，hover 時顯示 hover 那塊
  const defaultIndex = useMemo(() => {
    if (!safeData.length) return null
    let idx = 0
    for (let i = 1; i < safeData.length; i++) {
      if (safeData[i].value > safeData[idx].value) idx = i
    }
    return idx
  }, [safeData])

  const centerIndex = activeIndex ?? defaultIndex
  const centerItem = centerIndex != null ? safeData[centerIndex] : null
  const centerPct =
    total > 0 && centerItem ? (centerItem.value / total) * 100 : 0

  return (
    <Card
      elevation={0}
      sx={{ borderRadius: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
    >
      <CardContent sx={{ p: 3 }}>
        <Typography variant='subtitle1' sx={{ fontWeight: 800, mb: 1 }}>
          {title}
        </Typography>

        {safeData.length === 0 ? (
          <Box sx={{ height, display: 'grid', placeItems: 'center' }}>
            <Typography variant='body2' color='text.secondary'>
              No data
            </Typography>
          </Box>
        ) : (
          <Box sx={{ width: '100%', height }}>
            <ResponsiveContainer>
              <PieChart>
                <Tooltip
                  content={<DonutTooltip total={total} />}
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                />
                <Pie
                  data={safeData}
                  dataKey='value'
                  nameKey='name'
                  innerRadius='62%'
                  outerRadius='88%'
                  paddingAngle={2}
                  startAngle={90}
                  endAngle={-270}
                  onMouseEnter={(_, idx) => setActiveIndex(idx)}
                  onMouseLeave={() => setActiveIndex(null)}
                >
                  {safeData.map((_, idx) => (
                    <Cell key={idx} fill={colors[idx % colors.length]} />
                  ))}
                </Pie>

                {/* Center label */}
                <foreignObject x='0' y='0' width='100%' height='100%'>
                  <Box
                    sx={{
                      width: '100%',
                      height: '100%',
                      display: 'grid',
                      placeItems: 'center',
                      pointerEvents: 'none',
                    }}
                  >
                    <Box
                      sx={{
                        textAlign: 'center',
                        transform: 'translateY(-2px)',
                      }}
                    >
                      <Typography
                        variant='body1'
                        sx={{
                          fontWeight: 900,
                          lineHeight: 1.1,
                          color: colors[(centerIndex ?? 0) % colors.length],
                        }}
                      >
                        {centerItem?.name ?? ''}
                      </Typography>
                      <Typography
                        variant='h6'
                        sx={{
                          fontWeight: 900,
                          lineHeight: 1.1,
                          color: colors[(centerIndex ?? 0) % colors.length],
                        }}
                      >
                        {fmtPct(centerPct)}%
                      </Typography>
                    </Box>
                  </Box>
                </foreignObject>
              </PieChart>
            </ResponsiveContainer>
          </Box>
        )}

        {/* Legend */}
        {safeData.length > 0 && (
          <Stack
            direction='row'
            spacing={2}
            useFlexGap
            flexWrap='wrap'
            justifyContent='center'
            sx={{ mt: 1 }}
          >
            {safeData.map((d, idx) => (
              <Stack
                key={`${d.name}-${idx}`}
                direction='row'
                spacing={1}
                alignItems='center'
              >
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: '999px',
                    bgcolor: colors[idx % colors.length],
                  }}
                />
                <Typography variant='caption' sx={{ fontWeight: 700 }}>
                  {d.name}
                </Typography>
              </Stack>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  )
}
