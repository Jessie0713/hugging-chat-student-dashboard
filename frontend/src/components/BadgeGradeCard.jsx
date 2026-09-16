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

import { colors, radii, type } from '../theme/tokens'

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

const MILESTONE_ROWS = [
  { topics: 2, views: 2, score: 30 },
  { topics: 4, views: 3, score: 50 },
  { topics: 6, views: 4, score: 60 },
  { topics: 8, views: 5, score: 80 },
]

function ScoreRow({ label, value, hint }) {
  return (
    <Box>
      <Stack direction='row' justifyContent='space-between' alignItems='baseline' gap={1}>
        <Typography sx={{ fontWeight: 800, fontSize: 14, color: colors.ink }}>
          {label}
        </Typography>
        <Typography sx={{ fontWeight: 800, fontSize: 14, color: colors.ink }}>
          {value}
        </Typography>
      </Stack>
      {hint ? (
        <Typography sx={{ fontSize: 12, color: colors.muted, fontWeight: 700, mt: 0.25 }}>
          {hint}
        </Typography>
      ) : null}
    </Box>
  )
}

export function BadgeGradeSummary({
  gradeEstimate,
  loading,
  compact = false,
  showTitle = false,
  detailed = false,
}) {
  const g = gradeEstimate ?? {}
  const total = g.score ?? g.totalScore
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
  const guardianCount = Math.min(Math.max(Number(secondAdv) || 0, 0), 5)
  const advExtra = Math.max(0, (Number(secondAdv) || 0) - 5) * 2
  const viewExtra = Math.max(0, (Number(usage) || 0) - 5) * 2

  if (loading) {
    return (
      <Box sx={{ py: 4, display: 'grid', placeItems: 'center' }}>
        <CircularProgress size={22} />
      </Box>
    )
  }

  if (detailed) {
    return (
      <Stack spacing={1.75}>
        {showTitle ? (
          <Box>
            <Typography sx={{ ...type.sectionTitle, mb: 0.25 }}>詳細成績計算</Typography>
            <Typography sx={{ fontSize: 13, color: colors.muted, fontWeight: 700 }}>
              總分 = 主題里程碑 + 進階守護神獸 + 額外加成
            </Typography>
          </Box>
        ) : null}

        <Stack direction='row' alignItems='baseline' spacing={0.75} flexWrap='wrap'>
          <Typography variant='h3' sx={{ fontWeight: 900, lineHeight: 1 }}>
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
          />
        </Stack>

        <Typography sx={{ fontSize: 14, fontWeight: 800, color: colors.ink }}>
          {milestone} + {guardian} + {extra} = {total ?? 0}
        </Typography>

        <ScoreRow
          label='主題里程碑'
          value={`${milestone}/80`}
          hint='同時達到「有效主題」與「查看儀表板」次數，取最高一檔'
        />
        <Stack spacing={0.4}>
          {MILESTONE_ROWS.map((row) => {
            const reached = topics >= row.topics && usage >= row.views
            const current = milestone === row.score
            return (
              <Stack
                key={row.score}
                direction='row'
                justifyContent='space-between'
                sx={{
                  px: 1,
                  py: 0.4,
                  borderRadius: `${radii.md}px`,
                  bgcolor: current ? colors.sageSoft : 'transparent',
                  fontWeight: current ? 800 : 600,
                }}
              >
                <Typography sx={{ fontSize: 13, color: colors.ink }}>
                  {row.topics} 主題 + 查看儀表板 {row.views} 次
                </Typography>
                <Typography sx={{ fontSize: 13, color: reached ? colors.leafDark : colors.muted }}>
                  {row.score} 分{current ? ' · 目前' : reached ? ' · 已達' : ''}
                </Typography>
              </Stack>
            )
          })}
        </Stack>
        <Typography sx={{ fontSize: 12, color: colors.muted, fontWeight: 700 }}>
          目前：有效主題 {topics}/8 · 查看儀表板 {usage} 次 → {milestone} 分
        </Typography>

        <ScoreRow
          label='進階守護神獸'
          value={`${guardian}/20`}
          hint='第二次評級達進階（B2 以上），每題 4 分，最多 5 題'
        />
        <Typography sx={{ fontSize: 12, color: colors.muted, fontWeight: 700 }}>
          目前 {secondAdv} 題 → {guardianCount} × 4 = {guardian} 分
        </Typography>

        <ScoreRow
          label='額外加成'
          value={`+${extra}/${extraCap}`}
          hint='進階超過 5 題每次 +2；查看儀表板超過 5 次每次 +2，上限 8'
        />
        <LinearProgress
          variant='determinate'
          value={bonusPct}
          sx={{ height: 6, borderRadius: 3 }}
        />
        <Typography sx={{ fontSize: 12, color: colors.muted, fontWeight: 700 }}>
          進階超出 {advExtra / 2} 題 → +{advExtra}；查看儀表板超出 {viewExtra / 2} 次 → +{viewExtra}
          {advExtra + viewExtra > extraCap ? `（合計 ${advExtra + viewExtra}，以 ${extraCap} 封頂）` : ''}
        </Typography>

        <Typography sx={{ fontSize: 13, fontWeight: 800, color: colors.ink }}>
          課程小計 {course}/{maxCourse}（里程碑 + 守護神獸）
        </Typography>
      </Stack>
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
        有效主題 {topics}/8 · 查看儀表板 {usage} 次 · 第二次評級進階＋有效對話 {secondAdv}/5
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
