import { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { apiGet, apiPost, apiPut } from '../lib/api'
import { assistantHeaders } from '../lib/assistantAuth'
import { buttonPrimarySx, buttonSecondarySx, colors, radii, type } from '../theme/tokens'

const FILE_LABEL = {
  'faq.md': '常見問題',
  'operations.md': '操作說明',
  'themes-goals.md': '主題與目標',
  'badges-grades.md': '獎章與成績',
  'topic-fit.md': '切題',
}

export default function AdminFaqEditor() {
  const [bundle, setBundle] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [savedHint, setSavedHint] = useState('')
  const [resetOnce, setResetOnce] = useState(false)
  const [openIdx, setOpenIdx] = useState(0)
  const [openFile, setOpenFile] = useState('')

  const apply = (data) => {
    setBundle({
      title: data.title || '學生 FAQ',
      faqItems: data.faqItems || [],
      files: data.files || [],
      stored: data.stored,
      updatedAt: data.updatedAt,
      updatedBy: data.updatedBy,
      seededFromFile: data.seededFromFile,
    })
  }

  const load = () => {
    setErr('')
    apiGet('/api/assistant/admin/student-knowledge', { headers: assistantHeaders() })
      .then(apply)
      .catch((e) => setErr(String(e.message || e)))
  }

  useEffect(() => {
    load()
  }, [])

  const patchItems = (fn) => {
    setSavedHint('')
    setBundle((prev) => (prev ? { ...prev, faqItems: fn(prev.faqItems) } : prev))
  }

  const save = async () => {
    if (!bundle) return
    setBusy('save')
    setErr('')
    try {
      const data = await apiPut(
        '/api/assistant/admin/student-knowledge',
        {
          title: bundle.title,
          faqItems: bundle.faqItems,
          files: bundle.files,
        },
        { headers: assistantHeaders() },
      )
      apply(data)
      setSavedHint('已寫入 Mongo，學生助手會用這份 FAQ。')
    } catch (e) {
      setErr(String(e.message || e))
    } finally {
      setBusy('')
    }
  }

  const reset = async () => {
    if (!resetOnce) {
      setResetOnce(true)
      return
    }
    setBusy('reset')
    setErr('')
    setResetOnce(false)
    try {
      const data = await apiPost('/api/assistant/admin/student-knowledge/reset', {}, { headers: assistantHeaders() })
      apply(data)
      setSavedHint('已用檔案種子覆蓋 Mongo。')
    } catch (e) {
      setErr(String(e.message || e))
    } finally {
      setBusy('')
    }
  }

  if (!bundle) {
    return (
      <Card variant='outlined' sx={{ mb: 2, bgcolor: colors.paper, borderRadius: `${radii.lg}px` }}>
        <CardContent>
          <Typography sx={type.sectionTitle}>學生 FAQ</Typography>
          <Typography sx={{ fontSize: 14, mt: 1 }}>{err || '讀取中…'}</Typography>
        </CardContent>
      </Card>
    )
  }

  const otherFiles = (bundle.files || []).filter((f) => f.id !== 'faq.md')

  return (
    <Card variant='outlined' sx={{ mb: 2, bgcolor: colors.paper, borderRadius: `${radii.lg}px` }}>
      <CardContent>
        <Typography sx={type.sectionTitle}>學生 FAQ</Typography>
        <Typography sx={{ fontSize: 13, color: colors.muted, my: 1 }}>
          現行版存在 Mongo。這裡改完按儲存，恐龍學習助手會改用這份，不必改程式檔。
        </Typography>
        <Stack direction='row' spacing={1} flexWrap='wrap' useFlexGap sx={{ mb: 1.5 }}>
          <Chip size='small' label={bundle.stored ? '已存 Mongo' : '尚未寫入（顯示檔案種子）'} />
          <Chip size='small' label={`${bundle.faqItems.length} 則 FAQ`} />
          <Chip size='small' label={`${otherFiles.length} 份其他說明`} />
          {bundle.seededFromFile ? <Chip size='small' label='來源：檔案種子' variant='outlined' /> : null}
        </Stack>
        <Typography sx={{ fontSize: 12, color: colors.muted, mb: 1.5 }}>
          {bundle.updatedAt ? `更新 ${bundle.updatedAt}` : '尚未更新'}
          {bundle.updatedBy ? ` · ${bundle.updatedBy}` : ''}
        </Typography>
        {err ? <Typography color='error' sx={{ mb: 1, fontSize: 13 }}>{err}</Typography> : null}
        {savedHint ? <Typography sx={{ mb: 1, fontSize: 13, fontWeight: 700 }}>{savedHint}</Typography> : null}

        <Stack direction='row' alignItems='center' spacing={1} sx={{ mb: 1 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 13, flex: 1 }}>問答</Typography>
          <Button
            size='small'
            sx={buttonSecondarySx}
            onClick={() => {
              patchItems((items) => [...items, { q: '新問題', a: '' }])
              setOpenIdx(bundle.faqItems.length)
            }}
          >
            新增一則
          </Button>
        </Stack>

        {bundle.faqItems.map((item, i) => {
          const open = openIdx === i
          return (
            <Box key={`faq-${i}`} sx={{ mb: 1, p: 1.25, bgcolor: colors.wash, borderRadius: `${radii.md}px` }}>
              <Stack direction='row' spacing={1} alignItems='center'>
                <Box sx={{ flex: 1, cursor: 'pointer' }} onClick={() => setOpenIdx(open ? -1 : i)}>
                  <Typography sx={{ fontWeight: 800, fontSize: 14 }}>{item.q || '（未填問題）'}</Typography>
                  {!open ? (
                    <Typography sx={{ fontSize: 13, mt: 0.5, color: colors.ink }}>
                      {(item.a || '').slice(0, 140)}{(item.a || '').length > 140 ? '…' : ''}
                    </Typography>
                  ) : null}
                </Box>
                <Button size='small' onClick={() => setOpenIdx(open ? -1 : i)}>
                  {open ? '收合' : '編輯'}
                </Button>
                <Button
                  size='small'
                  onClick={() => {
                    patchItems((items) => items.filter((_, idx) => idx !== i))
                    if (openIdx === i) setOpenIdx(-1)
                  }}
                >
                  刪
                </Button>
              </Stack>
              {open ? (
                <Stack spacing={1} sx={{ mt: 1.25 }}>
                  <TextField
                    size='small'
                    label='問題'
                    value={item.q}
                    onChange={(e) =>
                      patchItems((items) => items.map((x, idx) => (idx === i ? { ...x, q: e.target.value } : x)))
                    }
                  />
                  <TextField
                    size='small'
                    multiline
                    minRows={3}
                    label='回答（助手會讀這段）'
                    value={item.a}
                    onChange={(e) =>
                      patchItems((items) => items.map((x, idx) => (idx === i ? { ...x, a: e.target.value } : x)))
                    }
                  />
                </Stack>
              ) : null}
            </Box>
          )
        })}

        <Typography sx={{ fontWeight: 800, fontSize: 13, mt: 2, mb: 1 }}>其他說明檔</Typography>
        {otherFiles.map((file) => {
          const open = openFile === file.id
          return (
            <Box key={file.id} sx={{ mb: 1, p: 1.25, bgcolor: colors.wash, borderRadius: `${radii.md}px` }}>
              <Stack direction='row' spacing={1} alignItems='center'>
                <Typography sx={{ fontWeight: 800, fontSize: 14, flex: 1 }}>
                  {FILE_LABEL[file.id] || file.title || file.id}
                </Typography>
                <Button size='small' onClick={() => setOpenFile(open ? '' : file.id)}>
                  {open ? '收合' : '查看／編輯'}
                </Button>
              </Stack>
              {open ? (
                <TextField
                  size='small'
                  fullWidth
                  multiline
                  minRows={6}
                  value={file.text}
                  onChange={(e) => {
                    setSavedHint('')
                    setBundle((prev) => ({
                      ...prev,
                      files: prev.files.map((f) => (f.id === file.id ? { ...f, text: e.target.value } : f)),
                    }))
                  }}
                  sx={{ mt: 1 }}
                />
              ) : (
                <Typography sx={{ fontSize: 13, mt: 0.5, color: colors.muted }}>
                  {(file.text || '').slice(0, 100)}{(file.text || '').length > 100 ? '…' : ''}
                </Typography>
              )}
            </Box>
          )
        })}

        <Stack direction='row' spacing={1} sx={{ mt: 2 }} flexWrap='wrap' useFlexGap>
          <Button sx={buttonPrimarySx} disabled={Boolean(busy)} onClick={save}>
            {busy === 'save' ? '儲存中…' : '儲存到 Mongo'}
          </Button>
          <Button sx={buttonSecondarySx} disabled={Boolean(busy)} onClick={reset}>
            {resetOnce ? '再按一次確認覆蓋' : busy === 'reset' ? '覆蓋中…' : '用檔案種子覆蓋'}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  )
}
