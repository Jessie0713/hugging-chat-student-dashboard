import { useEffect, useState } from 'react'
import {
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { apiGet } from '../lib/api'
import { teacherHeaders } from '../lib/teacherAuth'
import { BadgeGradeSummary } from './BadgeGradeCard'
import { colors, radii, type } from '../theme/tokens'

export default function StudentBadgesDialog({
  open,
  onClose,
  source,
  hfUserId,
  displayName,
}) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const loading = open && !data && !err

  useEffect(() => {
    if (!open || !source || !hfUserId) return
    let cancelled = false
    setErr('')
    setData(null)
    const qs = `source=${encodeURIComponent(source)}&hfUserId=${encodeURIComponent(hfUserId)}`
    apiGet(`/api/teacher/grade-review?${qs}`, { headers: teacherHeaders() })
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e.message || e))
      })
    return () => {
      cancelled = true
    }
  }, [open, source, hfUserId])

  const gradeEstimate = data?.grade
  const originalGrade = data?.originalGrade
  const originalScore = originalGrade?.score ?? originalGrade?.totalScore
  const adjustedScore = gradeEstimate?.score ?? gradeEstimate?.totalScore
  const scoreAdjusted = Boolean(data?.scoreAdjusted)
  const titleName = displayName || hfUserId || '學生'
  const redoRooms = data?.redoRooms || []
  const effectiveRooms = data?.effectiveRooms || []

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth='md'
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: `${radii.lg}px`,
          bgcolor: colors.paper,
          backgroundImage: 'none',
        },
      }}
    >
      <DialogTitle
        sx={{
          ...type.sectionTitle,
          position: 'relative',
          pr: 6,
          pb: 1,
        }}
      >
        {titleName}的詳細成績計算
        <IconButton
          aria-label='關閉'
          onClick={onClose}
          sx={{ position: 'absolute', right: 12, top: 10, color: colors.ink }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: 0.5, pb: 3 }}>
        {err ? (
          <Typography color='error'>{err}</Typography>
        ) : loading ? (
          <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}>
            <CircularProgress />
            <Typography sx={{ mt: 1.5, fontWeight: 700, color: colors.muted, fontSize: 14 }}>
              正在檢查有效對話是否切題…
            </Typography>
          </Box>
        ) : (
          <Stack spacing={2}>
            {redoRooms.length ? (
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: `${radii.md}px`,
                  bgcolor: '#fdeeee',
                  border: `1px solid ${colors.errorLight}`,
                }}
              >
                <Typography sx={{ fontWeight: 800, fontSize: 15, color: colors.error, mb: 0.75 }}>
                  雖符合有效對話，但內容不符合主題，以下主題不計入成績。請到主系統重新開聊天室重做對話練習：
                </Typography>
                <Stack spacing={0.75}>
                  {redoRooms.map((r) => (
                    <Typography key={r.assistantId} sx={{ fontSize: 14, color: colors.ink }}>
                      · {r.themeName}
                      {r.reason ? (
                        <Box component='span' sx={{ color: colors.muted, fontWeight: 700 }}>
                          {' '}— {r.reason}
                        </Box>
                      ) : null}
                    </Typography>
                  ))}
                </Stack>
                {scoreAdjusted ? (
                  <Typography sx={{ mt: 1, fontSize: 13, fontWeight: 800, color: colors.ink }}>
                    主系統仍顯示 {originalScore} 分（獎章已拿到、不收回）。教師計分 {adjustedScore} 分，不符主題不給該主題分數。
                  </Typography>
                ) : (
                  <Typography sx={{ mt: 1, fontSize: 13, fontWeight: 800, color: colors.ink }}>
                    獎章已拿到、不收回；該主題不計入教師成績。請到主系統重做對話練習。
                  </Typography>
                )}
              </Box>
            ) : effectiveRooms.length ? (
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: colors.leafDark }}>
                有效對話均與設定主題一致。獎章與成績與主系統相同。
              </Typography>
            ) : (
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: colors.muted }}>
                尚無有效對話可審查。
              </Typography>
            )}

            {redoRooms.length ? (
              <Typography sx={{ fontSize: 13, fontWeight: 800, color: colors.muted }}>
                以下為扣除不符主題後的教師計分；獎章仍與主系統相同。
              </Typography>
            ) : null}

            <BadgeGradeSummary
              gradeEstimate={gradeEstimate}
              loading={false}
              detailed
              showTitle
            />

            {effectiveRooms.length ? (
              <Box>
                <Typography sx={{ ...type.sectionTitle, fontSize: 16, mb: 1 }}>
                  有效對話切題檢查
                </Typography>
                <Stack spacing={1}>
                  {effectiveRooms.map((r) => (
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
                          label={r.needsRedo ? '不計分・請到主系統重做' : '切題'}
                          sx={{
                            fontWeight: 800,
                            bgcolor: r.needsRedo ? colors.error : colors.leaf,
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
        )}
      </DialogContent>
    </Dialog>
  )
}
