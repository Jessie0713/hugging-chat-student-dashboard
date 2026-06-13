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

function TopicRow({ topic }) {
  const count = topic.effectiveCount ?? 0
  const complete = topic.effectiveRoundComplete
  const progress = Math.min(count, 8) / 8

  return (
    <Box
      sx={{
        py: 1,
        borderBottom: '1px solid',
        borderColor: 'divider',
        '&:last-child': { borderBottom: 'none' },
      }}
    >
      <Stack
        direction='row'
        justifyContent='space-between'
        alignItems='center'
        spacing={1}
        sx={{ mb: 0.5 }}
      >
        <Typography variant='body2' sx={{ fontWeight: 700, minWidth: 0 }}>
          {topic.assistantName || topic.assistantId}
        </Typography>
        <Stack direction='row' spacing={0.5} flexShrink={0}>
          {topic.practiceTier ? (
            <Chip size='small' variant='outlined' label={topic.practiceTier} />
          ) : (
            <Chip size='small' variant='outlined' label='尚未評估' />
          )}
          {complete ? (
            <Chip size='small' color='success' label='有效一輪' />
          ) : null}
        </Stack>
      </Stack>
      <Stack direction='row' alignItems='center' spacing={1}>
        <LinearProgress
          variant='determinate'
          value={progress * 100}
          sx={{ flex: 1, height: 6, borderRadius: 3 }}
        />
        <Typography variant='caption' sx={{ opacity: 0.75, minWidth: 36 }}>
          {count}/8
        </Typography>
      </Stack>
    </Box>
  )
}

export default function BadgeTopicProgressCard({ topics = [], loading }) {
  const hasTopics = topics.length > 0

  return (
    <Card variant='outlined' sx={{ borderRadius: 3 }}>
      <CardContent>
        <Typography variant='h6' sx={{ fontWeight: 900, mb: 0.25 }}>
          逐題有效練習
        </Typography>
        <Typography variant='body2' sx={{ opacity: 0.7, mb: 1.5 }}>
          合格回應須為語音、全英文，且 ≥2 句或單句 &gt;10 字
        </Typography>

        {loading ? (
          <Box sx={{ py: 3, display: 'grid', placeItems: 'center' }}>
            <CircularProgress size={22} />
          </Box>
        ) : !hasTopics ? (
          <Typography variant='body2' sx={{ opacity: 0.7 }}>
            尚未累積有效練習紀錄
          </Typography>
        ) : (
          <Box>{topics.map((t) => <TopicRow key={t.assistantId} topic={t} />)}</Box>
        )}
      </CardContent>
    </Card>
  )
}
