import { useEffect, useState } from 'react'
import {
  Box,
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
    apiGet(`/api/${source}/student/${hfUserId}/badges`)
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

  const gradeEstimate = data?.badge?.gradeEstimate ?? data?.badge?.courseScore
  const titleName = displayName || hfUserId || '學生'

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
          </Box>
        ) : (
          <Stack spacing={1.5}>
            <BadgeGradeSummary
              gradeEstimate={gradeEstimate}
              loading={false}
              detailed
              showTitle
            />
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  )
}
