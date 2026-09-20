import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { apiGet } from '../lib/api'
import { teacherHeaders } from '../lib/teacherAuth'
import GradeReviewPanel from './GradeReviewPanel'
import { colors, radii, type } from '../theme/tokens'

export default function StudentBadgesDialog({
  open,
  onClose,
  source,
  hfUserId,
  displayName,
  onReviewed,
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
        if (cancelled) return
        setData(d)
        onReviewed?.(d)
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e.message || e))
      })
    return () => {
      cancelled = true
    }
  }, [open, source, hfUserId])

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
        <GradeReviewPanel
          data={data}
          loading={loading}
          err={err}
          source={source}
        />
      </DialogContent>
    </Dialog>
  )
}
