import { Box, Chip, CircularProgress, Stack, Typography } from '@mui/material'
import { BadgeGradeSummary } from './BadgeGradeCard'
import { isFixedLevelSource } from '../lib/badgeDefinitions'
import { colors, radii, type } from '../theme/tokens'

export function gradeReviewCopy(source) {
  const fixed = isFixedLevelSource(source)
  if (fixed) {
    return {
      loading: '正在檢查有效對話是否切題…',
      sectionTitle: '有效對話切題檢查',
      empty: '尚無有效對話可審查。',
      allOk: '有效對話都有在練設定主題。',
      banner:
        '以下主題幾乎沒有在練設定內容，不計入成績。請到主系統重新開聊天室重做對話練習：',
    }
  }
  return {
    loading: '正在檢查評級聊天室是否切題…',
    sectionTitle: '評級聊天室切題檢查',
    empty: '尚無評級聊天室可審查。',
    allOk: '評級對話都有在練設定主題。',
    banner:
      '以下主題幾乎沒有在練設定內容，不計入成績。請到主系統重新開聊天室重做對話練習：',
  }
}

export default function GradeReviewPanel({
  data,
  loading = false,
  err = '',
  source,
  compact = false,
  fallbackGrade,
}) {
  const copy = gradeReviewCopy(source)
  const gradeEstimate = data?.grade || fallbackGrade
  const adjustedScore = gradeEstimate?.score ?? gradeEstimate?.totalScore
  const redoRooms = data?.redoRooms || []
  const reviewedRooms = data?.reviewedRooms || data?.effectiveRooms || []

  if (err) {
    return <Typography color='error'>{err}</Typography>
  }

  if (loading) {
    return (
      <Box sx={{ py: compact ? 3 : 6, display: 'grid', placeItems: 'center' }}>
        <CircularProgress size={compact ? 22 : 32} />
        <Typography sx={{ mt: 1.5, fontWeight: 700, color: colors.muted, fontSize: 14 }}>
          {copy.loading}
        </Typography>
      </Box>
    )
  }

  return (
    <Stack spacing={compact ? 1.25 : 2}>
      {redoRooms.length ? (
        <Box
          sx={{
            p: compact ? 1.25 : 1.5,
            borderRadius: `${radii.md}px`,
            bgcolor: '#fdeeee',
            border: `1px solid ${colors.errorLight}`,
          }}
        >
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: compact ? 13 : 15,
              color: colors.error,
              mb: 0.75,
            }}
          >
            {copy.banner}
          </Typography>
          <Stack spacing={0.5}>
            {redoRooms.map((r) => (
              <Typography key={r.assistantId} sx={{ fontSize: compact ? 13 : 14, color: colors.ink }}>
                · {r.themeName}
                {r.reason && !compact ? (
                  <Box component='span' sx={{ color: colors.muted, fontWeight: 700 }}>
                    {' '}— {r.reason}
                  </Box>
                ) : null}
              </Typography>
            ))}
          </Stack>
          <Typography sx={{ mt: 1, fontSize: 13, fontWeight: 800, color: colors.ink }}>
            {adjustedScore != null ? `成績 ${adjustedScore} 分。沒有在練的主題不計入成績。` : '沒有在練的主題不計入成績。'}
          </Typography>
        </Box>
      ) : reviewedRooms.length ? (
        <Typography sx={{ fontSize: compact ? 13 : 14, fontWeight: 700, color: colors.leafDark }}>
          {copy.allOk}
        </Typography>
      ) : (
        <Typography sx={{ fontSize: compact ? 13 : 14, fontWeight: 700, color: colors.muted }}>
          {copy.empty}
        </Typography>
      )}

      {redoRooms.length ? (
        <Typography sx={{ fontSize: 13, fontWeight: 800, color: colors.muted }}>
          以下為切題檢查後的成績。
        </Typography>
      ) : null}

      <BadgeGradeSummary
        gradeEstimate={gradeEstimate}
        loading={false}
        detailed={!compact}
        compact={compact}
        showTitle
      />

      {reviewedRooms.length && !compact ? (
        <Box>
          <Typography sx={{ ...type.sectionTitle, fontSize: 16, mb: 1 }}>
            {copy.sectionTitle}
          </Typography>
          <Stack spacing={1}>
            {reviewedRooms.map((r) => (
              <Box
                key={r.assistantId}
                sx={{
                  p: 1.25,
                  borderRadius: `${radii.md}px`,
                  border: `1px solid ${r.needsRedo ? colors.errorLight : colors.line}`,
                  bgcolor: r.needsRedo ? '#fdeeee' : colors.wash,
                }}
              >
                <Stack direction='row' spacing={1} alignItems='center' flexWrap='wrap' useFlexGap>
                  <Typography sx={{ fontWeight: 800, fontSize: 14, color: colors.ink }}>
                    {r.themeName}
                  </Typography>
                  <Chip
                    size='small'
                    label={
                      r.needsRedo
                        ? '不計分・請到主系統重做'
                        : r.fit === 'related'
                          ? '有碰邊・計分'
                          : '切題'
                    }
                    sx={{
                      fontWeight: 800,
                      bgcolor: r.needsRedo
                        ? colors.error
                        : r.fit === 'related'
                          ? colors.amber
                          : colors.leaf,
                      color: '#fff',
                    }}
                  />
                </Stack>
                {r.reason ? (
                  <Typography sx={{ mt: 0.5, fontSize: 13, color: colors.muted, fontWeight: 700 }}>
                    {r.reason}
                  </Typography>
                ) : null}
              </Box>
            ))}
          </Stack>
        </Box>
      ) : null}
    </Stack>
  )
}
