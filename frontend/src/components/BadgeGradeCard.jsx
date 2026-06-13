import {
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material'

export default function BadgeGradeCard({ gradeEstimate, loading }) {
  const score = gradeEstimate?.score
  const scoreLabel = gradeEstimate?.scoreLabel ?? '尚未達標'
  const completed = gradeEstimate?.completedTopicCount ?? 0
  const advanced = gradeEstimate?.advancedTopicCount ?? 0
  const levelMet = gradeEstimate?.levelRequirementMet

  return (
    <Card variant='outlined' sx={{ borderRadius: 3, height: '100%' }}>
      <CardContent>
        <Typography variant='h6' sx={{ fontWeight: 900, mb: 0.25 }}>
          口說成績預估
        </Typography>
        <Typography variant='body2' sx={{ opacity: 0.7, mb: 1.5 }}>
          依有效練習主題數與進階達標計算（對齊成績表）
        </Typography>

        {loading ? (
          <Box sx={{ py: 3, display: 'grid', placeItems: 'center' }}>
            <CircularProgress size={22} />
          </Box>
        ) : (
          <Stack spacing={1.25}>
            <Stack direction='row' alignItems='baseline' spacing={1}>
              <Typography variant='h3' sx={{ fontWeight: 900, lineHeight: 1 }}>
                {score != null ? score : '—'}
              </Typography>
              {score != null ? (
                <Typography variant='body1' sx={{ opacity: 0.7 }}>
                  分
                </Typography>
              ) : null}
              <Chip
                size='small'
                label={scoreLabel}
                color={score != null ? 'primary' : 'default'}
                variant={score != null ? 'filled' : 'outlined'}
              />
            </Stack>

            <Typography variant='body2' sx={{ opacity: 0.8 }}>
              有效主題 {completed}/7
              <Box component='span' sx={{ mx: 1, opacity: 0.4 }}>
                ·
              </Box>
              進階達標 {advanced}/4
            </Typography>

            <Chip
              size='small'
              color={levelMet ? 'success' : 'default'}
              variant='outlined'
              label={
                levelMet ? '進階等級要求：已達標' : '進階等級要求：尚未達標'
              }
              sx={{ alignSelf: 'flex-start' }}
            />

            <Typography variant='caption' sx={{ opacity: 0.6 }}>
              65 分＝5 題有效一輪 · 85 分＝6 題 · 100 分＝7 題 · 進階達標＝4
              題進階
            </Typography>
          </Stack>
        )}
      </CardContent>
    </Card>
  )
}
