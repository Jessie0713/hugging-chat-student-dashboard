import { useMemo } from 'react'
import {
  Box,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material'
import { PieChart } from '@mui/x-charts/PieChart'
import { useTheme } from '@mui/material/styles'
import { classifyPracticeFit, FIT_PIE_COLORS } from '../lib/levelDisplay'

const fixedPanelSx = {
  borderRadius: 3,
  height: 360,
  display: 'flex',
  flexDirection: 'column',
}

export default function PracticeFitSummaryCard({
  recentPractice = [],
  loading,
}) {
  const theme = useTheme()
  const practiceCount = recentPractice.length

  const { seriesData, colors, matched, unmatched } = useMemo(() => {
    let matchedCount = 0
    let unmatchedCount = 0
    for (const item of recentPractice) {
      if (classifyPracticeFit(item.fitStatus) === 'matched') {
        matchedCount += 1
      } else {
        unmatchedCount += 1
      }
    }

    if (practiceCount === 0) {
      return {
        seriesData: [{ id: 0, value: 1, label: '無資料' }],
        colors: [theme.palette.grey[200]],
        matched: 0,
        unmatched: 0,
      }
    }

    // 兩類都保留在圖例；數值為 0 的類別不畫扇形（避免 MUI 無法顯示 0）
    const data = []
    if (matchedCount > 0) {
      data.push({ id: 0, value: matchedCount, label: '符合等級' })
    }
    if (unmatchedCount > 0) {
      data.push({ id: 1, value: unmatchedCount, label: '不符合等級' })
    }

    return {
      seriesData: data,
      colors: data.map((d) => FIT_PIE_COLORS[d.label] || theme.palette.grey[400]),
      matched: matchedCount,
      unmatched: unmatchedCount,
    }
  }, [recentPractice, practiceCount, theme])

  const hasData = practiceCount > 0

  return (
    <Card variant='outlined' sx={fixedPanelSx}>
      <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Typography variant='h6' sx={{ fontWeight: 900, mb: 0.25 }}>
          練習適配概況
        </Typography>
        <Typography variant='body2' sx={{ opacity: 0.7, mb: 0.5 }}>
          {loading
            ? '—'
            : practiceCount
              ? `最近 ${practiceCount} 間聊天室`
              : '尚無評估紀錄'}
        </Typography>
        <Typography variant='caption' sx={{ opacity: 0.6, display: 'block', mb: 1 }}>
          練習與所選等級的符合情形
        </Typography>

        {loading ? (
          <Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }}>
            <CircularProgress />
          </Box>
        ) : !hasData ? (
          <Typography variant='body2' sx={{ opacity: 0.7, py: 2 }}>
            完成對話並觸發評估後會顯示適配狀態
          </Typography>
        ) : (
          <>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                height: 200,
                flex: 1,
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
                slotProps={{ legend: { hidden: true } }}
                margin={{ top: 10, bottom: 10, left: 10, right: 10 }}
              />
            </Box>
            <Stack
              direction='row'
              spacing={2}
              justifyContent='center'
              sx={{ mt: 1 }}
            >
              <Typography variant='body2' sx={{ opacity: 0.85 }}>
                <Box
                  component='span'
                  sx={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    bgcolor: FIT_PIE_COLORS['符合等級'],
                    mr: 0.5,
                    verticalAlign: 'middle',
                  }}
                />
                符合等級 {matched}
              </Typography>
              <Typography variant='body2' sx={{ opacity: 0.85 }}>
                <Box
                  component='span'
                  sx={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    bgcolor: FIT_PIE_COLORS['不符合等級'],
                    mr: 0.5,
                    verticalAlign: 'middle',
                  }}
                />
                不符合等級 {unmatched}
              </Typography>
            </Stack>
          </>
        )}
      </CardContent>
    </Card>
  )
}
