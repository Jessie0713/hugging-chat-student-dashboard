import { useEffect, useRef, useState } from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Drawer,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import SendRoundedIcon from '@mui/icons-material/SendRounded'
import ThumbUpAltIcon from '@mui/icons-material/ThumbUpAlt'
import ThumbUpAltOutlinedIcon from '@mui/icons-material/ThumbUpAltOutlined'
import ThumbDownAltIcon from '@mui/icons-material/ThumbDownAlt'
import ThumbDownAltOutlinedIcon from '@mui/icons-material/ThumbDownAltOutlined'
import { apiGet, apiPost } from '../lib/api'
import {
  assistantHeaders,
  getAssistantSessionId,
  setAssistantSessionId,
} from '../lib/assistantAuth'
import { getChatUiOrigin } from '../lib/chatUiLink'
import { buttonPrimarySx, buttonSecondarySx, colors, dinoShadow, radii, type } from '../theme/tokens'

function studentReplyLinks(text, source, hfUserId) {
  if (!hfUserId) return []
  const t = text || ''
  const base = `/${source || 'rolling_level'}/student/${hfUserId}`
  const items = []
  const add = (link) => {
    if (!items.some((x) => x.label === link.label)) items.push(link)
  }
  if (/總覽|成績|獎章|108|里程碑|切題/.test(t)) {
    add({ label: '總覽', href: `${base}/overview` })
  }
  if (/練習建議|查看儀表板|弱點|策劃|觀察進度/.test(t)) {
    add({ label: '練習建議', href: `${base}/practice-next` })
  }
  if (/對話分析|語法健檢|健檢報告|培力|英檢/.test(t)) {
    add({ label: '對話分析', href: `${base}/conversations` })
  }
  if (/主聊天室|主系統|開始練習|語音輸入|黃色麥克風|側邊欄/.test(t)) {
    add({ label: '主系統', href: getChatUiOrigin(source), external: true })
  }
  return items
}

function teacherReplyLinks(text, source) {
  const t = text || ''
  const src = source || 'rolling_level'
  const items = []
  const add = (link) => {
    if (!items.some((x) => x.label === link.label)) items.push(link)
  }
  if (/名冊|未達標|KPI|學生|切題|成績/.test(t)) {
    add({ label: '教師名冊', href: `/teacher/${src}` })
  }
  if (/變動/.test(t)) add({ label: '變動等級', href: '/teacher/rolling_level' })
  if (/固定/.test(t)) add({ label: '固定等級', href: '/teacher/fixed_level' })
  if (/兩組|比較/.test(t)) add({ label: '兩組合計', href: '/teacher/all' })
  return items
}

export default function AssistantPanel({ context = 'student' }) {
  const { source, hfUserId } = useParams()
  const isTeacher = context === 'teacher'
  const [open, setOpen] = useState(false)
  const [meta, setMeta] = useState(null)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [reportFor, setReportFor] = useState(null)
  const [reportNote, setReportNote] = useState('')
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const composingRef = useRef(false)
  const keepEmptyRef = useRef(false)
  const voteRef = useRef({})

  const clearDraft = () => {
    keepEmptyRef.current = true
    setQuestion('')
    const el = inputRef.current
    if (el && typeof el.value === 'string') el.value = ''
    window.setTimeout(() => {
      setQuestion('')
      if (inputRef.current && typeof inputRef.current.value === 'string') {
        inputRef.current.value = ''
      }
    }, 0)
    window.setTimeout(() => {
      keepEmptyRef.current = false
    }, 160)
  }

  useEffect(() => {
    const qs = isTeacher ? '?audience=teacher' : '?audience=student'
    apiGet(`/api/assistant/meta${qs}`, { headers: assistantHeaders() })
      .then(setMeta)
      .catch(() => setMeta(null))
  }, [open, isTeacher])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, open])

  const send = async (text) => {
    const q = (text || question).trim()
    if (!q || loading) return
    clearDraft()
    setErr('')
    setMessages((prev) => [...prev, { role: 'user', content: q }])
    setLoading(true)
    try {
      const data = await apiPost(
        '/api/assistant/chat',
        {
          sessionId: getAssistantSessionId(context) || undefined,
          question: q,
          page: context,
          audience: isTeacher ? 'teacher' : 'student',
          source: source || undefined,
        },
        { headers: assistantHeaders() },
      )
      if (data.sessionId) setAssistantSessionId(data.sessionId, context)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.answer,
          messageId: data.messageId,
          citations: data.citations,
          tools: data.tools,
          knowledgeVersion: data.knowledgeVersion,
          links: data.links,
          modelUnavailable: data.modelUnavailable,
          refused: data.refused,
        },
      ])
    } catch (e) {
      setErr(String(e.message || e))
    } finally {
      setLoading(false)
      clearDraft()
    }
  }

  const sendFeedback = async (msg, helpful, note, category) => {
    if (!msg?.messageId) return
    const isVote = !note && category !== 'issue'
    if (isVote) {
      if (voteRef.current[msg.messageId] === helpful) return
      voteRef.current[msg.messageId] = helpful
      setMessages((prev) =>
        prev.map((m) => (m.messageId === msg.messageId ? { ...m, vote: helpful } : m)),
      )
    }
    try {
      await apiPost(
        '/api/assistant/feedback',
        {
          sessionId: getAssistantSessionId(context),
          messageId: msg.messageId,
          helpful,
          note,
          category,
        },
        { headers: assistantHeaders() },
      )
    } catch {
      /* ignore */
    }
  }

  const suggested = meta?.suggestedQuestions || []
  const personal = Boolean(meta?.personalDataEnabled)
  const title = meta?.title || (isTeacher ? '班級助教' : '恐龍學習助手')

  return (
    <>
      {!open ? (
        <Box
          sx={{
            position: 'fixed',
            right: { xs: 10, sm: 18 },
            bottom: { xs: 10, sm: 18 },
            zIndex: 30,
            width: 110,
            height: 88,
            pointerEvents: 'none',
            '@keyframes hcFlashBeam': {
              '0%, 100%': { opacity: 0.22, transform: 'scale(0.9)' },
              '40%': { opacity: 0.95, transform: 'scale(1.12)' },
              '55%': { opacity: 0.4, transform: 'scale(1)' },
            },
            '@keyframes hcFlashBulb': {
              '0%, 100%': { filter: `${dinoShadow} brightness(1)` },
              '40%': { filter: `${dinoShadow} brightness(1.28)` },
              '55%': { filter: `${dinoShadow} brightness(1.05)` },
            },
          }}
        >
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              left: 0,
              bottom: 10,
              width: 58,
              height: 58,
              borderRadius: '50%',
              background:
                'radial-gradient(circle, rgba(255,236,170,0.95) 0%, rgba(255,214,120,0.4) 46%, rgba(255,214,120,0) 72%)',
              animation: 'hcFlashBeam 1.35s ease-in-out infinite',
              '@media (prefers-reduced-motion: reduce)': {
                animation: 'none',
                opacity: 0.45,
              },
            }}
          />
          <IconButton
            onClick={() => setOpen(true)}
            aria-label={isTeacher ? '打開班級助教' : '打開學習助手'}
            sx={{
              position: 'absolute',
              right: 0,
              bottom: 4,
              pointerEvents: 'auto',
              p: 0.5,
              bgcolor: 'transparent',
              '&:hover': { bgcolor: 'transparent', transform: 'translateY(-2px)' },
            }}
          >
            <Box
              component='img'
              src='/dinosaurs/flashlight.png'
              alt=''
              sx={{
                width: 76,
                height: 'auto',
                display: 'block',
                animation: 'hcFlashBulb 1.35s ease-in-out infinite',
                '@media (prefers-reduced-motion: reduce)': {
                  animation: 'none',
                  filter: dinoShadow,
                },
              }}
            />
          </IconButton>
        </Box>
      ) : null}

      <Drawer
        anchor='right'
        open={open}
        onClose={() => setOpen(false)}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: 420 },
            bgcolor: colors.paper,
            backgroundImage: 'none',
            p: 2,
          },
        }}
      >
        <Stack direction='row' alignItems='center' spacing={1} sx={{ mb: 1 }}>
          <Box
            component='img'
            src={isTeacher ? '/dinosaurs/dino-kaiju.png' : '/dinosaurs/flashlight.png'}
            alt=''
            sx={{
              width: isTeacher ? 40 : 52,
              height: isTeacher ? 40 : 'auto',
              display: 'block',
              filter: dinoShadow,
            }}
          />
          <Box sx={{ flex: 1 }}>
            <Typography sx={type.sectionTitle}>{title}</Typography>
            <Typography sx={{ fontSize: 12, color: colors.muted, fontWeight: 700 }}>
              {isTeacher
                ? '用班級知識圖譜說明進度、未達標與切題規則'
                : personal
                  ? '可查已授權的進度資料'
                  : '未驗證登入：僅公共 FAQ'}
            </Typography>
          </Box>
          <IconButton onClick={() => setOpen(false)} aria-label='關閉'>
            <CloseIcon />
          </IconButton>
        </Stack>

        {!isTeacher && !personal ? (
          <Typography sx={{ fontSize: 12, color: colors.muted, fontWeight: 700, mb: 1 }}>
            個人成績與主題進度需要主系統可驗證登入。輸入學號不能當作正式認證。
          </Typography>
        ) : null}

        <Stack direction='row' flexWrap='wrap' useFlexGap spacing={0.75} sx={{ mb: 1.5 }}>
          {suggested.map((q) => (
            <Chip
              key={q}
              size='small'
              label={q}
              onClick={() => send(q)}
              sx={{ fontWeight: 800, bgcolor: colors.sageSoft }}
            />
          ))}
        </Stack>

        <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 280, pr: 0.5 }}>
          {messages.map((m, i) => (
            <Box
              key={i}
              sx={{
                mb: 1.25,
                p: 1.25,
                borderRadius: `${radii.md}px`,
                bgcolor: m.role === 'user' ? colors.sageSoft : colors.wash,
                border: `1px solid ${colors.line}`,
              }}
            >
              <Typography sx={{ fontSize: 14, color: colors.ink, whiteSpace: 'pre-wrap' }}>
                {m.content}
              </Typography>
              {m.role === 'assistant' ? (
                <Stack spacing={0.5} sx={{ mt: 1 }}>
                  {m.knowledgeVersion ? (
                    <Typography sx={{ fontSize: 11, color: colors.muted, fontWeight: 700 }}>
                      依據：{isTeacher ? '知識圖譜' : '課程規則'} {m.knowledgeVersion}
                      {m.tools?.length ? ` · 查詢 ${m.tools.map((t) => t.name).join('、')}` : ''}
                    </Typography>
                  ) : null}
                  <Stack direction='row' spacing={0.5}>
                    <IconButton
                      size='small'
                      onClick={() => sendFeedback(m, true)}
                      aria-label='有幫助'
                      aria-pressed={m.vote === true}
                      sx={{
                        color: m.vote === true ? colors.leafDark : colors.muted,
                        cursor: m.vote === true ? 'default' : 'pointer',
                      }}
                    >
                      {m.vote === true ? (
                        <ThumbUpAltIcon fontSize='small' />
                      ) : (
                        <ThumbUpAltOutlinedIcon fontSize='small' />
                      )}
                    </IconButton>
                    <IconButton
                      size='small'
                      onClick={() => sendFeedback(m, false)}
                      aria-label='沒幫助'
                      aria-pressed={m.vote === false}
                      sx={{
                        color: m.vote === false ? colors.woodDark : colors.muted,
                        cursor: m.vote === false ? 'default' : 'pointer',
                      }}
                    >
                      {m.vote === false ? (
                        <ThumbDownAltIcon fontSize='small' />
                      ) : (
                        <ThumbDownAltOutlinedIcon fontSize='small' />
                      )}
                    </IconButton>
                    <Button size='small' onClick={() => setReportFor(m)} sx={{ fontWeight: 800 }}>
                      回報
                    </Button>
                  </Stack>
                  {(() => {
                    const prev = messages[i - 1]
                    const blob = `${prev?.role === 'user' ? prev.content : ''}\n${m.content}`
                    const links = isTeacher
                      ? teacherReplyLinks(blob, source)
                      : studentReplyLinks(blob, source, hfUserId)
                    if (!links.length) return null
                    return (
                      <Stack direction='row' spacing={1} flexWrap='wrap' useFlexGap>
                        {links.map((link) => (
                          <Button
                            key={`${link.label}-${link.href}`}
                            {...(link.external
                              ? { href: link.href, target: '_blank', rel: 'noreferrer' }
                              : { component: RouterLink, to: link.href })}
                            size='small'
                            sx={buttonSecondarySx}
                          >
                            {link.label}
                          </Button>
                        ))}
                      </Stack>
                    )
                  })()}
                </Stack>
              ) : null}
            </Box>
          ))}
          {loading ? (
            <Stack direction='row' spacing={1} alignItems='center' sx={{ py: 1 }}>
              <CircularProgress size={16} />
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: colors.muted }}>
                {isTeacher ? '正在查班級圖譜…' : '恐龍正在查規則…'}
              </Typography>
            </Stack>
          ) : null}
          {err ? (
            <Stack spacing={0.5} sx={{ mb: 1 }}>
              <Typography color='error' sx={{ fontSize: 13 }}>{err}</Typography>
              <Button size='small' onClick={() => send(messages.filter((m) => m.role === 'user').slice(-1)[0]?.content)} sx={buttonSecondarySx}>
                重試
              </Button>
            </Stack>
          ) : null}
          <div ref={bottomRef} />
        </Box>

        {reportFor ? (
          <Stack spacing={1} sx={{ mt: 1, p: 1, border: `1px dashed ${colors.sand}`, borderRadius: `${radii.md}px` }}>
            <Typography sx={{ fontWeight: 800, fontSize: 13 }}>問題回報</Typography>
            <TextField
              size='small'
              multiline
              minRows={2}
              value={reportNote}
              onChange={(e) => setReportNote(e.target.value)}
              placeholder='補充說明（不要貼完整學號或成績表）'
            />
            <Stack direction='row' spacing={1}>
              <Button
                size='small'
                sx={buttonPrimarySx}
                onClick={async () => {
                  await sendFeedback(reportFor, false, reportNote, 'issue')
                  setReportFor(null)
                  setReportNote('')
                }}
              >
                送出回報
              </Button>
              <Button size='small' onClick={() => setReportFor(null)}>取消</Button>
            </Stack>
          </Stack>
        ) : null}

        <Stack direction='row' spacing={1} sx={{ mt: 1.5 }}>
          <TextField
            fullWidth
            size='small'
            inputRef={inputRef}
            value={question}
            onChange={(e) => {
              if (keepEmptyRef.current) {
                e.target.value = ''
                setQuestion('')
                return
              }
              setQuestion(e.target.value)
            }}
            placeholder={isTeacher ? '問班級進度、未達標、切題規則…' : '問成績規則、主題進度…'}
            onCompositionStart={() => {
              composingRef.current = true
            }}
            onCompositionEnd={() => {
              composingRef.current = false
              if (keepEmptyRef.current) {
                setQuestion('')
                if (inputRef.current) inputRef.current.value = ''
              }
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229 || composingRef.current) return
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          <IconButton
            onClick={() => send()}
            disabled={loading}
            aria-label='送出'
            sx={{
              ...buttonPrimarySx,
              minWidth: 44,
              width: 44,
              height: 44,
              px: 0,
              borderRadius: '50%',
            }}
          >
            <SendRoundedIcon />
          </IconButton>
        </Stack>
      </Drawer>
    </>
  )
}
