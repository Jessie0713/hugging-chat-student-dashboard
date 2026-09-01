import {
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material'

import { radii, type } from '../theme/tokens'

const panelSx = {
  borderRadius: `${radii.lg}px`,
  height: 360,
  display: 'flex',
  flexDirection: 'column',
}

const contentSx = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  pr: 0.5,
  '&::-webkit-scrollbar': { width: 8 },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 8,
  },
}

export function BadgeGradeSummary({
  gradeEstimate,
  loading,
  compact = false,
  showTitle = false,
}) {
  const g = gradeEstimate ?? {}
  const total = g.score
  const scoreLabel = g.scoreLabel ?? '尚未達標'
  const milestone = g.milestoneScore ?? 0
  const guardian = g.guardianScore ?? 0
  const extra = g.extraBonus ?? 0
  const extraCap = g.extraBonusCap ?? 8
  const course = g.courseScore ?? milestone + guardian
  const maxCourse = g.maxCourseScore ?? 100
  const maxTotal = g.maxTotalScore ?? 108
  const topics = g.completedTopicCount ?? 0
  const usage = g.dashboardUsageCount ?? g.dashboardViewCount ?? 0
  const secondAdv = g.secondAdvancedCount ?? 0

  const bonusPct = extraCap > 0 ? Math.min(100, (extra / extraCap) * 100) : 0

  if (loading) {
    return (
      <Box sx={{ py: 4, display: 'grid', placeItems: 'center' }}>
        <CircularProgress size={22} />
      </Box>
    )
  }

  return (
    <Stack spacing={1.25}>
      {showTitle ? (
        <>
          <Typography sx={{ ...type.sectionTitle, mb: 0.25 }}>課程成績</Typography>
          <Typography
            sx={{
              ...type.subtitle,
              mb: 0.5,
              ...(compact ? { fontSize: '0.72rem', lineHeight: 1.35 } : {}),
            }}
          >
            里程碑 80 + 守護神獸 20 = 100；額外最高 +8
          </Typography>
        </>
      ) : null}

      <Stack direction='row' alignItems='baseline' spacing={0.75} flexWrap='wrap'>
        <Typography
          variant={compact ? 'h4' : 'h3'}
          sx={{ fontWeight: 900, lineHeight: 1 }}
        >
          {total != null ? total : '—'}
        </Typography>
        {total != null ? (
          <Typography variant='body2' sx={{ opacity: 0.7 }}>
            / {maxTotal} 分
          </Typography>
        ) : null}
        <Chip
          size='small'
          label={scoreLabel}
          color={course >= maxCourse ? 'success' : 'primary'}
          variant='filled'
          sx={compact ? { fontSize: '0.68rem', height: 22 } : undefined}
        />
      </Stack>

      <Stack spacing={0.5}>
        <Stack direction='row' justifyContent='space-between'>
          <Typography variant='body2' sx={{ fontSize: compact ? '0.8rem' : undefined }}>
            主題里程碑
          </Typography>
          <Typography variant='body2' sx={{ fontWeight: 700 }}>
            {milestone}/80
          </Typography>
        </Stack>
        <Stack direction='row' justifyContent='space-between'>
          <Typography variant='body2' sx={{ fontSize: compact ? '0.8rem' : undefined }}>
            進階守護神獸
          </Typography>
          <Typography variant='body2' sx={{ fontWeight: 700 }}>
            {guardian}/20
          </Typography>
        </Stack>
        <Stack direction='row' justifyContent='space-between'>
          <Typography variant='body2' sx={{ fontSize: compact ? '0.8rem' : undefined }}>
            課程小計
          </Typography>
          <Typography variant='body2' sx={{ fontWeight: 800 }}>
            {course}/{maxCourse}
          </Typography>
        </Stack>
      </Stack>

      <Box>
        <Stack direction='row' justifyContent='space-between' sx={{ mb: 0.5 }}>
          <Typography variant='caption' sx={{ fontWeight: 700 }}>
            額外加成
          </Typography>
          <Typography variant='caption'>
            +{extra}/{extraCap}
          </Typography>
        </Stack>
        <LinearProgress
          variant='determinate'
          value={bonusPct}
          sx={{ height: 6, borderRadius: 3 }}
        />
      </Box>

      <Typography variant='caption' sx={{ opacity: 0.8, lineHeight: 1.45 }}>
        有效主題 {topics}/8 · 完成練習 {usage} 次 · 第二次評級進階 {secondAdv}/5
      </Typography>

      
    </Stack>
  )
}

export default function BadgeGradeCard({ gradeEstimate, loading, compact = false }) {
  return (
    <Card variant='outlined' sx={panelSx}>
      <CardContent sx={contentSx}>
        <BadgeGradeSummary
          gradeEstimate={gradeEstimate}
          loading={loading}
          compact={compact}
          showTitle
        />
      </CardContent>
    </Card>
  )
}
