import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import AdminFaqEditor from '../components/AdminFaqEditor'
import AdminGraphEditor from '../components/AdminGraphEditor'
import HabitatBackground from '../components/HabitatBackground'
import { apiGet, apiPost } from '../lib/api'
import { assistantHeaders, clearAssistantAuth, getAssistantToken } from '../lib/assistantAuth'
import { buttonPrimarySx, buttonSecondarySx, colors, radii, type } from '../theme/tokens'

export default function AdminReview() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState('')
  const [tab, setTab] = useState('faq')

  const load = () => {
    apiGet('/api/assistant/admin/overview', { headers: assistantHeaders() })
      .then(setData)
      .catch((e) => {
        setErr(String(e.message || e))
        if (String(e.message || '').includes('403') || String(e.message || '').includes('401')) {
          navigate('/admin/login', { replace: true })
        }
      })
  }

  useEffect(() => {
    if (!getAssistantToken()) {
      navigate('/admin/login', { replace: true })
      return
    }
    load()
  }, [navigate])

  const act = async (label, fn) => {
    setBusy(label)
    setErr('')
    try {
      await fn()
      load()
    } catch (e) {
      setErr(String(e.message || e))
    } finally {
      setBusy('')
    }
  }

  const settings = data?.settings || {}
  const proposals = data?.proposals || []
  const clusters = data?.clusters || []
  const jobs = data?.jobs || []
  const published = data?.published || []
  const feedback = data?.feedback || []
  const feedbackCounts = data?.feedbackCounts || {}
  const codingRunner = data?.codingRunner || {}
  const unprocessed = feedbackCounts.unprocessed || 0
  const pendingReview = proposals.filter((p) => p.status === 'pending_review').length

  const tabSx = {
    flexWrap: 'wrap',
    gap: 0.5,
    '& .MuiToggleButtonGroup-grouped': {
      borderRadius: `${radii.btn}px !important`,
      border: `1px solid ${colors.sand} !important`,
      marginLeft: '0 !important',
    },
    '& .MuiToggleButton-root': {
      fontWeight: 800,
      fontSize: 13,
      px: 1.5,
      color: colors.ink,
      '&.Mui-selected': {
        bgcolor: colors.leaf,
        color: colors.white,
        borderColor: `${colors.leaf} !important`,
      },
    },
  }

  return (
    <Box sx={{ minHeight: '100vh', position: 'relative' }}>
      <HabitatBackground />
      <Container maxWidth='lg' sx={{ position: 'relative', zIndex: 1, py: 3 }}>
        <Stack direction='row' justifyContent='space-between' alignItems='center' sx={{ mb: 2 }}>
          <Typography sx={{ ...type.pageTitle, fontSize: 22 }}>改版審核</Typography>
          <Button
            sx={buttonSecondarySx}
            onClick={() => {
              clearAssistantAuth()
              navigate('/')
            }}
          >
            離開
          </Button>
        </Stack>
        {err ? <Typography color='error' sx={{ mb: 2 }}>{err}</Typography> : null}

        <ToggleButtonGroup
          exclusive
          size='small'
          value={tab}
          onChange={(_, v) => v && setTab(v)}
          sx={{ ...tabSx, mb: 2 }}
        >
          <ToggleButton value='faq'>學生 FAQ</ToggleButton>
          <ToggleButton value='graph'>教師圖譜</ToggleButton>
          <ToggleButton value='reports'>
            問題回報{unprocessed ? `（${unprocessed}）` : ''}
          </ToggleButton>
          <ToggleButton value='review'>
            審核發布{pendingReview ? `（${pendingReview}）` : ''}
          </ToggleButton>
          <ToggleButton value='system'>系統</ToggleButton>
        </ToggleButtonGroup>

        <Box sx={{ display: tab === 'faq' ? 'block' : 'none' }}>
          <AdminFaqEditor />
        </Box>
        <Box sx={{ display: tab === 'graph' ? 'block' : 'none' }}>
          <AdminGraphEditor />
        </Box>

        {tab === 'reports' ? (
          <>
            <Card variant='outlined' sx={{ mb: 2, bgcolor: colors.paper, borderRadius: `${radii.lg}px` }}>
              <CardContent>
                <Stack direction='row' spacing={1} alignItems='center' flexWrap='wrap' useFlexGap>
                  <Typography sx={{ ...type.sectionTitle, flex: 1 }}>問題回報</Typography>
                  <Button
                    size='small'
                    sx={buttonPrimarySx}
                    disabled={Boolean(busy)}
                    onClick={() => act('run', () => apiPost('/api/assistant/admin/run-once', {}, { headers: assistantHeaders() }))}
                  >
                    彙整成群組
                  </Button>
                </Stack>
                <Typography sx={{ fontSize: 13, color: colors.muted, my: 1 }}>
                  共 {feedbackCounts.total || 0} 則 · 尚未整理 {unprocessed} ·
                  有幫助 {feedbackCounts.helpful || 0} · 沒幫助／回報 {feedbackCounts.unhelpful || 0}
                </Typography>
                <Typography sx={{ fontSize: 12, color: colors.muted, mb: 1 }}>
                  助手裡按讚、倒讚或「回報」會立刻寫入這裡。按「彙整成群組」才會做成去識別問題群組與知識候選。
                </Typography>
                {feedback.length === 0 ? (
                  <Typography sx={{ mt: 1, fontSize: 14 }}>尚無回報。請在學生或教師助手對回答按倒讚或送出回報。</Typography>
                ) : null}
                {feedback.map((f, i) => (
                  <Box key={`${f.messageId || i}-${f.createdAt || i}`} sx={{ mt: 1, p: 1.25, bgcolor: colors.wash, borderRadius: `${radii.md}px` }}>
                    <Stack direction='row' spacing={1} alignItems='center' flexWrap='wrap' useFlexGap>
                      <Chip size='small' label={f.helpful === true ? '有幫助' : f.helpful === false ? '沒幫助' : '回饋'} />
                      <Chip size='small' label={f.category || '未分類'} variant='outlined' />
                      <Chip size='small' label={f.role || 'public'} variant='outlined' />
                      {f.processed ? <Chip size='small' label='已整理' /> : <Chip size='small' label='未整理' color='warning' />}
                    </Stack>
                    {f.question ? (
                      <Typography sx={{ fontWeight: 800, mt: 0.75, fontSize: 14 }}>問：{f.question}</Typography>
                    ) : null}
                    {f.note ? (
                      <Typography sx={{ fontSize: 14, mt: 0.5, whiteSpace: 'pre-wrap' }}>{f.note}</Typography>
                    ) : (
                      <Typography sx={{ fontSize: 13, color: colors.muted, mt: 0.5 }}>沒有補充說明</Typography>
                    )}
                    <Typography sx={{ fontSize: 12, color: colors.muted, mt: 0.5 }}>
                      {f.createdAt || ''}{f.source ? ` · ${f.source}` : ''}
                    </Typography>
                  </Box>
                ))}
              </CardContent>
            </Card>

            <Card variant='outlined' sx={{ mb: 2, bgcolor: colors.paper, borderRadius: `${radii.lg}px` }}>
              <CardContent>
                <Typography sx={type.sectionTitle}>去識別問題群組</Typography>
                <Typography sx={{ fontSize: 12, color: colors.muted, mt: 0.5, mb: 1 }}>
                  彙整後才會把上面的回報做成群組，並可到「審核發布」產出知識候選版。
                </Typography>
                {clusters.length === 0 ? <Typography sx={{ mt: 1, fontSize: 14 }}>尚無群組</Typography> : null}
                {clusters.map((c) => (
                  <Box key={c.clusterKey} sx={{ mt: 1, p: 1, bgcolor: colors.wash, borderRadius: `${radii.md}px` }}>
                    <Typography sx={{ fontWeight: 800 }}>{c.normalizedQuestion || c.label}</Typography>
                    <Typography sx={{ fontSize: 12, color: colors.muted }}>
                      {c.category} · {c.count || c.total} 則
                    </Typography>
                  </Box>
                ))}
              </CardContent>
            </Card>
          </>
        ) : null}

        {tab === 'review' ? (
          <>
            <Card variant='outlined' sx={{ mb: 2, bgcolor: colors.paper, borderRadius: `${radii.lg}px` }}>
              <CardContent>
                <Typography sx={type.sectionTitle}>現行／歷史版本</Typography>
                {published.length === 0 ? (
                  <Typography sx={{ mt: 1, fontSize: 14 }}>目前使用內建知識 v1（檔案）。學生 FAQ 與教師圖譜也可在對應頁籤直接存 Mongo。</Typography>
                ) : (
                  published.map((v) => (
                    <Stack key={v.versionId} direction='row' spacing={1} alignItems='center' sx={{ mt: 1 }}>
                      <Chip size='small' label={v.status} />
                      <Typography sx={{ fontWeight: 800 }}>{v.versionId}</Typography>
                      <Typography sx={{ fontSize: 12, color: colors.muted }}>{v.title}</Typography>
                      <Button
                        size='small'
                        onClick={() => act('rollback', () => apiPost(`/api/assistant/admin/rollback/${v.versionId}`, {}, { headers: assistantHeaders() }))}
                      >
                        回復此版
                      </Button>
                    </Stack>
                  ))
                )}
              </CardContent>
            </Card>

            <Card variant='outlined' sx={{ mb: 2, bgcolor: colors.paper, borderRadius: `${radii.lg}px` }}>
              <CardContent>
                <Typography sx={type.sectionTitle}>候選版</Typography>
                <Typography sx={{ fontSize: 13, color: colors.muted, my: 1, whiteSpace: 'pre-wrap' }}>
                  {`核准／發布只幫助手多一段說明文字，不是改儀表板程式。
你要看的「具體改成怎樣」就是每張候選裡的「會改／不會改」和完整草稿。
程式碼（CSV、新圖表、計分）不會因為按核准而更新，請看「系統」。`}
                </Typography>
                <TextField
                  size='small'
                  fullWidth
                  label='退回原因'
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  sx={{ my: 1 }}
                />
                {proposals.length === 0 ? (
                  <Typography sx={{ mt: 1, fontSize: 14 }}>
                    還沒有候選版。請到「問題回報」按「彙整成群組」，系統會把未整理回報做成一份草稿。
                  </Typography>
                ) : null}
                {proposals.map((p) => {
                  const status = p.status
                  const canEval = status === 'draft' || status === 'failed'
                  const canApprove = status === 'pending_review'
                  const canReject = !['published', 'rejected', 'publishing'].includes(status)
                  const canPublish = status === 'approved'
                  const evalRules = p.evaluation?.rules
                  const nextHint = {
                    draft: '下一步：評估',
                    evaluating: '評估中',
                    pending_review: '下一步：核准或退回',
                    failed: '評估未過，可再評估或退回',
                    approved: '下一步：發布（發布後助手才會用）',
                    publishing: '發布中',
                    published: '已進助手知識',
                    rejected: '已退回，不會生效',
                  }[status] || status
                  const statusColor = status === 'pending_review'
                    ? 'warning'
                    : status === 'approved' || status === 'published'
                      ? 'success'
                      : 'default'
                  return (
                    <Box key={p.proposalId} sx={{ mt: 1.5, p: 1.25, border: `1px solid ${colors.line}`, borderRadius: `${radii.md}px` }}>
                      <Stack direction='row' spacing={1} alignItems='center' flexWrap='wrap' useFlexGap>
                        <Chip size='small' label={status} color={statusColor} />
                        <Typography sx={{ fontWeight: 800 }}>{p.draft?.title || p.proposalId}</Typography>
                      </Stack>
                      <Typography sx={{ fontSize: 13, color: colors.muted, mt: 0.5, fontWeight: 700 }}>
                        {nextHint}
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: colors.muted, mt: 0.5 }}>
                        {p.draft?.kind} · hash {String(p.contentHash || '').slice(0, 12)} ·
                        {(p.draft?.cohorts || []).join('/')}
                      </Typography>
                      {evalRules ? (
                        <Typography sx={{ fontSize: 12, mt: 0.5, color: evalRules.passed ? colors.ink : '#9a3412' }}>
                          評估：{evalRules.passed ? '通過（B1/基礎、108、獎章不收回等規則仍在）' : `未過：${(evalRules.failures || []).map((x) => x.reason).join('；') || '規則失敗'}`}
                        </Typography>
                      ) : null}
                      {p.rejectReason ? (
                        <Typography sx={{ fontSize: 12, mt: 0.5 }}>退回原因：{p.rejectReason}</Typography>
                      ) : null}
                      {p.draft?.needsHumanCode ? (
                        <Typography sx={{ fontSize: 13, mt: 0.75, fontWeight: 800 }}>
                          這份含功能需求：核准不會做出 CSV／新圖表，只會讓助手「知道有人提過」。
                        </Typography>
                      ) : null}
                      <Box sx={{ mt: 1, p: 1, bgcolor: colors.wash, borderRadius: `${radii.md}px` }}>
                        <Typography sx={{ fontWeight: 800, fontSize: 13 }}>會改</Typography>
                        {(p.draft?.willChange || ['發布後助手多讀這份補充說明（內建檔案不變）']).map((x) => (
                          <Typography key={x} sx={{ fontSize: 13 }}>· {x}</Typography>
                        ))}
                        <Typography sx={{ fontWeight: 800, fontSize: 13, mt: 1 }}>不會改</Typography>
                        {(p.draft?.willNotChange || ['不改成績／獎章／名冊畫面', '不自動更新 Git 程式碼']).map((x) => (
                          <Typography key={x} sx={{ fontSize: 13 }}>· {x}</Typography>
                        ))}
                      </Box>
                      <Typography sx={{ fontWeight: 800, fontSize: 13, mt: 1.25 }}>完整草稿（發布後助手會讀到）</Typography>
                      <Typography sx={{ fontSize: 13, whiteSpace: 'pre-wrap', mt: 0.5 }}>
                        {String(p.draft?.draftMarkdown || '（無草稿）')}
                      </Typography>
                      <Stack direction='row' spacing={1} sx={{ mt: 1 }} flexWrap='wrap' useFlexGap>
                        <Button
                          size='small'
                          disabled={!canEval || Boolean(busy)}
                          onClick={() => act('eval', () => apiPost(`/api/assistant/admin/proposals/${p.proposalId}/evaluate`, {}, { headers: assistantHeaders() }))}
                        >
                          評估
                        </Button>
                        <Button
                          size='small'
                          sx={buttonPrimarySx}
                          disabled={!canApprove || Boolean(busy)}
                          onClick={() => act('approve', () => apiPost(`/api/assistant/admin/proposals/${p.proposalId}/approve`, { contentHash: p.contentHash }, { headers: assistantHeaders() }))}
                        >
                          核准
                        </Button>
                        <Button
                          size='small'
                          disabled={!canReject || Boolean(busy)}
                          onClick={() => act('reject', () => apiPost(`/api/assistant/admin/proposals/${p.proposalId}/reject`, { reason }, { headers: assistantHeaders() }))}
                        >
                          退回
                        </Button>
                        <Button
                          size='small'
                          sx={buttonPrimarySx}
                          disabled={!canPublish || Boolean(busy)}
                          onClick={() => act('publish', () => apiPost(`/api/assistant/admin/proposals/${p.proposalId}/publish`, {}, { headers: assistantHeaders() }))}
                        >
                          發布
                        </Button>
                      </Stack>
                    </Box>
                  )
                })}
              </CardContent>
            </Card>
          </>
        ) : null}

        {tab === 'system' ? (
          <>
            <Card variant='outlined' sx={{ mb: 2, bgcolor: colors.paper, borderRadius: `${radii.lg}px` }}>
              <CardContent>
                <Typography sx={type.sectionTitle}>排程（預設停用）</Typography>
                <Typography sx={{ fontSize: 13, color: colors.muted, my: 1 }}>
                  時區 {settings.timezone || 'Asia/Taipei'} · 啟用 {String(Boolean(settings.enabled))} ·
                  {settings.hour}:{String(settings.minute || 0).padStart(2, '0')}
                </Typography>
                <Stack direction='row' spacing={1} flexWrap='wrap' useFlexGap>
                  <Button
                    sx={buttonSecondarySx}
                    disabled={Boolean(busy)}
                    onClick={() => act('enable', () => apiPost('/api/assistant/admin/settings', { enabled: true }, { headers: assistantHeaders() }))}
                  >
                    啟用排程
                  </Button>
                  <Button
                    sx={buttonSecondarySx}
                    disabled={Boolean(busy)}
                    onClick={() => act('disable', () => apiPost('/api/assistant/admin/settings', { enabled: false }, { headers: assistantHeaders() }))}
                  >
                    停用
                  </Button>
                  <Button
                    sx={buttonPrimarySx}
                    disabled={Boolean(busy)}
                    onClick={() => act('run', () => apiPost('/api/assistant/admin/run-once', {}, { headers: assistantHeaders() }))}
                  >
                    手動執行一次
                  </Button>
                </Stack>
              </CardContent>
            </Card>

            <Card variant='outlined' sx={{ bgcolor: colors.paper, borderRadius: `${radii.lg}px` }}>
              <CardContent>
                <Typography sx={type.sectionTitle}>程式碼更新</Typography>
                <Typography sx={{ fontSize: 13, color: colors.muted, my: 1, whiteSpace: 'pre-wrap' }}>
                  {`現況：不會自動改這個 repo 的程式。
要改畫面／加 CSV／改計分：在本機改檔，跟平常開發一樣（不要指望按核准）。
自動 runner 需要 DASHBOARD_CODE_GIT_REMOTE 與 DASHBOARD_CODE_CI_TOKEN；就算有，目前也只允許預覽、不會部署正式環境。`}
                </Typography>
                <Chip size='small' label={codingRunner.status || 'blocked'} sx={{ mr: 1 }} />
                <Typography sx={{ fontSize: 13, mt: 1 }}>
                  {codingRunner.message || '尚未檢查'}
                </Typography>
                <Typography sx={{ fontSize: 12, color: colors.muted, mt: 0.5 }}>
                  Git remote {codingRunner.gitRemoteSet ? '已設' : '未設'} · CI token {codingRunner.ciTokenSet ? '已設' : '未設'}
                </Typography>
                <Typography sx={{ ...type.sectionTitle, mt: 2, fontSize: 16 }}>執行紀錄</Typography>
                {jobs.length === 0 ? <Typography sx={{ fontSize: 14, mt: 1 }}>尚無執行紀錄</Typography> : null}
                {jobs.map((j) => (
                  <Box key={j.jobKey} sx={{ mt: 1 }}>
                    <Typography sx={{ fontSize: 13 }}>
                      {j.trigger} · {j.status} · {j.jobKey}
                    </Typography>
                    {j.coding?.message ? (
                      <Typography sx={{ fontSize: 12, color: colors.muted }}>
                        程式 runner：{j.coding.status} · {j.coding.message}
                      </Typography>
                    ) : null}
                    {j.proposal?.reason || j.proposal?.proposalId ? (
                      <Typography sx={{ fontSize: 12, color: colors.muted }}>
                        候選：{j.proposal?.created ? `已建立 ${j.proposal.proposalId}` : j.proposal?.reason}
                      </Typography>
                    ) : null}
                  </Box>
                ))}
                <Button
                  sx={{ ...buttonSecondarySx, mt: 1 }}
                  onClick={() => act('code', () => apiPost('/api/assistant/admin/code-preview', {}, { headers: assistantHeaders() }))}
                >
                  再檢查程式 runner
                </Button>
              </CardContent>
            </Card>
          </>
        ) : null}
      </Container>
    </Box>
  )
}
