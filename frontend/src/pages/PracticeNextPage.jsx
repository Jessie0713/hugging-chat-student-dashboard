import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  Checkbox,
  Stack,
  Typography,
  Snackbar,
  Alert,
  Tooltip,
  keyframes,
} from '@mui/material'
import { apiGet } from '../lib/api'
import {
  formatFitStatus,
  getFitStatusChipProps,
} from '../lib/levelDisplay'
import {
  aggregateWeaknesses,
  flattenRatedAssistants,
  flattenRecentPractice,
  SRL_GOAL_ROOMS,
  SRL_GOAL_TIER,
  getRubricConditionsForTier,
  inferRollingPrimaryTier,
  isFixedLevelSource,
  recommendAssistants,
  summarizeAdvancedFitProgress,
  summarizeRollingAdvancedProgress,
  summarizeFit,
} from '../lib/practiceRecommend'
import {
  tone,
  colors,
  radii,
  buttonPrimarySx,
  buttonSecondarySx,
  type,
} from '../theme/tokens'

const bob = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-7px); }
`

const floatFly = keyframes`
  0%, 100% { transform: translateY(0) rotate(-2deg); }
  50% { transform: translateY(-10px) rotate(2deg); }
`

const sway = keyframes`
  0%, 100% { transform: rotate(-3deg); }
  50% { transform: rotate(3deg); }
`

const hop = keyframes`
  0%, 100% { transform: translateY(0) scale(1); }
  40% { transform: translateY(-10px) scale(1.05); }
  60% { transform: translateY(-4px) scale(1.02); }
`

const wiggle = keyframes`
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-8deg); }
  75% { transform: rotate(8deg); }
`

const popIn = keyframes`
  0% { transform: scale(0.85) translateY(8px); opacity: 0; }
  100% { transform: scale(1) translateY(0); opacity: 1; }
`

const slideUp = keyframes`
  0% { transform: translateY(18px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
`

const speechPop = keyframes`
  0% { transform: scale(0.92) translateY(6px); opacity: 0; }
  70% { transform: scale(1.02) translateY(0); opacity: 1; }
  100% { transform: scale(1) translateY(0); opacity: 1; }
`

const pulseRing = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(138, 154, 123, 0.45); }
  70% { box-shadow: 0 0 0 12px rgba(138, 154, 123, 0); }
  100% { box-shadow: 0 0 0 0 rgba(138, 154, 123, 0); }
`

const shimmer = keyframes`
  0% { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
`

const footprint = keyframes`
  0%, 100% { opacity: 0.35; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.15); }
`

const starTwinkle = keyframes`
  0%, 100% { transform: scale(1) rotate(0deg); }
  50% { transform: scale(1.18) rotate(12deg); }
`

/** 侏羅紀嚮導：三隻恐龍對應自我調節三步驟（觀察 → 策劃 → 行動） */
const DINO = {
  observe: {
    id: 'observe',
    src: '/dinosaurs/dino-flyer.png',
    alt: '翼手龍',
    name: '翼手龍',
    latin: 'Quetzalcoatlus',
    role: '觀察',
    srlStep: 'monitor',
    section: 'progress',
  },
  plan: {
    id: 'plan',
    src: '/dinosaurs/dino-armor.png',
    alt: '甲龍',
    name: '甲龍',
    latin: 'Ankylosaurus',
    role: '策劃',
    srlStep: 'plan',
    section: 'focus',
  },
  act: {
    id: 'act',
    src: '/dinosaurs/dino-rex.png',
    alt: '角龍',
    name: '角龍',
    latin: 'Ceratosaurus',
    role: '行動',
    srlStep: 'act',
    section: 'recommend',
  },
}

const DINO_GUIDES = [DINO.observe, DINO.plan, DINO.act]

function buildMonitorBriefing({ count, goal, met, fixed, primaryTier }) {
  if (met) {
    return fixed
      ? `觀察｜太棒了！${goal} 個聊天室都符合進階了。之後可複習弱點，把表現練得更穩。`
      : `觀察｜太棒了！${goal} 個聊天室都到達進階了。之後可回頭精煉比較弱的情境。`
  }
  const left = Math.max(0, goal - count)
  if (fixed) {
    return `觀察｜目前 ${count}/${goal} 間符合進階，還差 ${left} 間。看完進度後，點「甲龍」來策劃這次要練的弱點吧。`
  }
  return `觀察｜目前 ${count}/${goal} 間到達進階（多數在「${primaryTier}」），還差 ${left} 間。下一步點「甲龍」策劃本次目標。`
}

function buildPlanBriefing({ weaknesses, selectedFocuses }) {
  if (!weaknesses.length) {
    return '策劃｜還沒有弱點資料。先去主系統完成評估，再回來訂這次的練習目標。'
  }
  const top = weaknesses[0]?.tag
  const chosen = selectedFocuses.length
    ? selectedFocuses.join('、')
    : '（尚未勾選）'
  return `策劃｜這步是選定「這次要練什麼」。最常出現的是「${top}」；你目前選了：${chosen}。勾好後按「查看推薦聊天室」，或直接點「角龍」出發。`
}

function buildActBriefing({
  selectedFocuses,
  submittedFocuses,
  recommendations,
  pickedId,
}) {
  if (!selectedFocuses.length) {
    return '行動｜還沒有練習目標。先點「甲龍」完成策劃，再來選聊天室。'
  }
  if (submittedFocuses === null) {
    return `行動｜目標是「${selectedFocuses.join('、')}」。按「查看推薦聊天室」，或再點一次「角龍」，我會帶你去選一間練。`
  }
  if (!recommendations.length) {
    return '行動｜目前沒有對應推薦。換一組弱點再試，或先回主系統多練幾次，再請「翼手龍」觀察。'
  }
  if (pickedId) {
    return '行動｜聊天室已選好！請回主系統練習；練完再點「翼手龍」觀察進度有沒有前進。'
  }
  return `行動｜這裡有 ${recommendations.length} 間推薦聊天室。選一間開始練，練完再回來觀察——觀察→策劃→行動，循環前進。`
}

const softCardSx = {
  borderRadius: `${radii.lg}px`,
  border: '1px solid',
  borderColor: tone.line,
  bgcolor: tone.paper,
  boxShadow: 'none',
  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: '0 8px 20px rgba(74, 69, 63, 0.06)',
  },
}

function ConditionRow({ condition }) {
  return (
    <Box
      sx={{
        py: 1.1,
        borderBottom: '1px solid',
        borderColor: tone.line,
        '&:last-child': { borderBottom: 'none' },
      }}
    >
      <Typography
        variant='subtitle2'
        sx={{ fontWeight: 800, color: tone.ink }}
      >
        {condition.name}
      </Typography>
      <Typography variant='body2' sx={{ color: tone.muted, mt: 0.25 }}>
        {condition.description}
      </Typography>
    </Box>
  )
}

function SectionBlock({
  stepLabel,
  title,
  hint,
  dinoSrc,
  children,
  delay = 0,
  dinoMotion = 'bob',
}) {
  const dinoAnim =
    dinoMotion === 'fly'
      ? `${floatFly} 3s ease-in-out infinite`
      : dinoMotion === 'sway'
        ? `${sway} 2.6s ease-in-out infinite`
        : `${bob} 2.4s ease-in-out infinite`

  return (
    <Card
      variant='outlined'
      sx={{
        ...softCardSx,
        position: 'relative',
        overflow: 'hidden',
        animation: `${slideUp} 0.5s ease both`,
        animationDelay: `${delay}ms`,
        background: `linear-gradient(165deg, ${tone.paper} 0%, #fff 60%, ${tone.sageSoft} 140%)`,
        borderColor: tone.line,
        borderWidth: 1,
        borderRadius: `${radii.lg}px`,
        boxShadow: 'none',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: -40,
          right: -30,
          width: 140,
          height: 140,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${tone.sky}66 0%, transparent 70%)`,
          pointerEvents: 'none',
        },
      }}
    >
      <CardContent sx={{ p: { xs: 2, sm: 2.5 }, position: 'relative' }}>
        <Stack
          direction='row'
          spacing={1.75}
          alignItems='center'
          sx={{ mb: 2 }}
        >
          {dinoSrc ? (
            <Box
              sx={{
                width: 104,
                height: 104,
                flexShrink: 0,
                borderRadius: '50%',
                bgcolor: tone.wash,
                border: '2px solid',
                borderColor: tone.sageSoft,
                display: 'grid',
                placeItems: 'center',
                animation: `${pulseRing} 2.4s ease-out infinite`,
                background: `radial-gradient(circle at 40% 35%, #fff 0%, ${tone.wash} 70%)`,
              }}
            >
              <Box
                component='img'
                src={dinoSrc}
                alt=''
                sx={{
                  width: 78,
                  height: 78,
                  objectFit: 'contain',
                  animation: dinoAnim,
                  transition: 'transform 0.25s ease',
                  '&:hover': { animation: `${wiggle} 0.55s ease` },
                }}
              />
            </Box>
          ) : null}
          <Box sx={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
            {stepLabel ? (
              <Typography
                sx={{
                  display: 'inline-block',
                  px: 1.35,
                  py: 0.35,
                  mb: 0.75,
                  borderRadius: `${radii.sm}px`,
                  bgcolor: tone.sageSoft,
                  color: tone.leaf,
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: '0.02em',
                  border: '1px dashed',
                  borderColor: tone.sage,
                  animation: `${popIn} 0.4s ease both`,
                }}
              >
                {stepLabel}
              </Typography>
            ) : null}
            <Typography
              sx={{
                ...type.sectionTitle,
                mb: 0,
              }}
            >
              {title}
            </Typography>
            {hint ? (
              <Typography
                variant='body2'
                sx={{ color: tone.muted, mt: 0.5, lineHeight: 1.5 }}
              >
                {hint}
              </Typography>
            ) : null}
          </Box>
        </Stack>
        {children}
      </CardContent>
    </Card>
  )
}

function ProgressTrail({ count, goal, met }) {
  const slots = Array.from({ length: goal }, (_, i) => i < count)
  return (
    <Stack spacing={1.25}>
      <Stack direction='row' spacing={0.75} useFlexGap flexWrap='wrap'>
        {slots.map((filled, i) => (
          <Tooltip
            key={i}
            title={filled ? `第 ${i + 1} 間已達進階` : `第 ${i + 1} 間還在路上`}
            arrow
          >
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                border: '2px solid',
                borderColor: filled ? tone.leaf : tone.line,
                bgcolor: filled ? tone.sageSoft : '#fff',
                display: 'grid',
                placeItems: 'center',
                fontSize: filled ? 16 : 13,
                fontWeight: 800,
                color: filled ? tone.leaf : tone.sand,
                transition: 'transform 0.2s ease, background 0.2s ease',
                animation: filled
                  ? `${popIn} 0.4s ease both, ${starTwinkle} 2.2s ease-in-out ${i * 0.15}s infinite`
                  : 'none',
                animationDelay: filled ? undefined : undefined,
                cursor: 'default',
                boxShadow: filled
                  ? '0 4px 10px rgba(111, 143, 94, 0.18)'
                  : 'none',
                '&:hover': { transform: 'scale(1.12) rotate(-6deg)' },
              }}
            >
              {filled ? '★' : i + 1}
            </Box>
          </Tooltip>
        ))}
      </Stack>
      <Box
        sx={{
          position: 'relative',
          height: 12,
          borderRadius: `${radii.sm}px`,
          bgcolor: tone.wash,
          overflow: 'hidden',
          border: '1px solid',
          borderColor: tone.line,
        }}
      >
        <Box
          sx={{
            height: '100%',
            width: `${Math.min(100, (count / Math.max(goal, 1)) * 100)}%`,
            borderRadius: `${radii.sm}px`,
            background: met
              ? `linear-gradient(90deg, ${tone.leaf}, ${tone.sage}, ${tone.leaf})`
              : `linear-gradient(90deg, ${tone.sand}, ${tone.amber}, ${tone.sand})`,
            backgroundSize: '200% 100%',
            animation: `${shimmer} 2.8s linear infinite`,
            transition: 'width 0.7s ease',
          }}
        />
      </Box>
    </Stack>
  )
}

function RecommendationCard({ item, selected, onSelect, mode, index = 0 }) {
  const title =
    mode === 'fixed' && item.conversationTitle
      ? item.conversationTitle
      : item.assistantName
  const pickId = item.conversationId || item.assistantId

  return (
    <Card
      variant='outlined'
      sx={{
        borderRadius: `${radii.lg}px`,
        border: '1px solid',
        borderColor: selected ? tone.sage : tone.line,
        bgcolor: selected ? tone.sageSoft : '#fff',
        animation: `${popIn} 0.4s ease both`,
        animationDelay: `${index * 80}ms`,
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        '&:hover': {
          transform: 'translateY(-3px)',
          boxShadow: '0 10px 22px rgba(74, 69, 63, 0.08)',
        },
      }}
    >
      <CardContent>
        <Stack spacing={1.25}>
          <Box>
            <Typography variant='h6' sx={{ fontWeight: 800, color: tone.ink }}>
              {title}
            </Typography>
            {mode === 'fixed' &&
            item.conversationTitle &&
            item.assistantName &&
            item.conversationTitle !== item.assistantName ? (
              <Typography variant='caption' sx={{ color: tone.muted }}>
                情境：{item.assistantName}
              </Typography>
            ) : null}
          </Box>
          <Stack direction='row' spacing={0.5} useFlexGap flexWrap='wrap'>
            <Chip
              size='small'
              variant='outlined'
              label={
                mode === 'fixed'
                  ? `選擇等級：${item.targetProductTier || item.levelTier}`
                  : `目前等級：${item.levelTier}`
              }
              sx={{ borderColor: tone.line, color: tone.ink }}
            />
            {mode === 'fixed' && item.fitStatus ? (
              <Chip
                size='small'
                label={formatFitStatus(item.fitStatus)}
                {...getFitStatusChipProps(item.fitStatus)}
              />
            ) : null}
          </Stack>
          <Box>
            <Typography
              variant='caption'
              sx={{ fontWeight: 800, color: tone.muted }}
            >
              推薦原因
            </Typography>
            <Typography variant='body2' sx={{ color: tone.ink }}>
              {item.reason}
            </Typography>
          </Box>
          <Box>
            <Typography
              variant='caption'
              sx={{ fontWeight: 800, color: tone.muted }}
            >
              對應弱點
            </Typography>
            <Stack
              direction='row'
              spacing={0.5}
              useFlexGap
              flexWrap='wrap'
              sx={{ mt: 0.5 }}
            >
              {item.matchedFocus.map((f) => (
                <Chip
                  key={f}
                  size='small'
                  label={f}
                  variant='outlined'
                  sx={{ borderColor: tone.line, bgcolor: tone.wash }}
                />
              ))}
            </Stack>
          </Box>
          <Box>
            <Typography
              variant='caption'
              sx={{ fontWeight: 800, color: tone.muted }}
            >
              練習重點
            </Typography>
            <Typography variant='body2' sx={{ color: tone.ink }}>
              {item.practiceFocus}
            </Typography>
          </Box>
          <Button
            variant={selected ? 'contained' : 'outlined'}
            onClick={() => onSelect(pickId)}
            sx={{
              alignSelf: 'flex-start',
              ...(selected ? buttonPrimarySx : buttonSecondarySx),
            }}
          >
            {selected ? '已選這個 ★' : '我選這個目標開始練習'}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  )
}

const STEP_BY_DINO = { observe: 1, plan: 2, act: 3 }

export default function PracticeNextPage() {
  const { source, hfUserId } = useParams()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [selectedFocuses, setSelectedFocuses] = useState([])
  const [submittedFocuses, setSubmittedFocuses] = useState(null)
  const [pickedId, setPickedId] = useState('')
  const [snackOpen, setSnackOpen] = useState(false)
  /** 目前顯示步驟：1 觀察 → 2 策劃 → 3 行動 */
  const [step, setStep] = useState(1)
  /** 已解鎖到第幾步（不可跳過） */
  const [unlockedTo, setUnlockedTo] = useState(1)
  const [dinoSpeech, setDinoSpeech] = useState(
    '先跟翼手龍觀察進度，再一步一步往下走。',
  )
  const [activeDino, setActiveDino] = useState('observe')
  const [wiggleId, setWiggleId] = useState(null)
  const contentRef = useRef(null)

  const fixed = isFixedLevelSource(source)
  const mode = fixed ? 'fixed' : 'rolling'
  const loading = !data && !err

  const goStep = (next, speech, dinoId) => {
    setStep(next)
    setUnlockedTo((prev) => Math.max(prev, next))
    if (dinoId) setActiveDino(dinoId)
    if (speech) setDinoSpeech(speech)
    window.setTimeout(() => {
      contentRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    }, 40)
  }

  useEffect(() => {
    let cancelled = false
    setErr('')
    setData(null)
    setSelectedFocuses([])
    setSubmittedFocuses(null)
    setPickedId('')
    setStep(1)
    setUnlockedTo(1)
    setActiveDino('observe')
    setDinoSpeech('先跟翼手龍觀察進度，再一步一步往下走。')
    apiGet(`/api/${source}/student/${hfUserId}/overview`)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [source, hfUserId])

  const practiceItems = useMemo(() => {
    if (fixed) return flattenRecentPractice(data?.recentPractice)
    return flattenRatedAssistants(data?.cefrGroups)
  }, [data, fixed])

  const primaryTier = useMemo(() => {
    if (fixed) return SRL_GOAL_TIER
    return inferRollingPrimaryTier(practiceItems)
  }, [practiceItems, fixed])

  const goalTier = SRL_GOAL_TIER

  const fitSummary = useMemo(
    () => (fixed ? summarizeFit(practiceItems) : null),
    [practiceItems, fixed],
  )

  const advancedProgress = useMemo(() => {
    const fromApi = data?.advancedFitProgress
    if (
      fromApi &&
      typeof fromApi.count === 'number' &&
      typeof fromApi.goal === 'number'
    ) {
      return {
        tier: fromApi.tier || SRL_GOAL_TIER,
        count: fromApi.count,
        goal: fromApi.goal || SRL_GOAL_ROOMS,
        met: Boolean(fromApi.met),
        mode: fromApi.mode || (fixed ? 'fixed' : 'rolling'),
      }
    }
    return fixed
      ? summarizeAdvancedFitProgress(practiceItems)
      : summarizeRollingAdvancedProgress(practiceItems)
  }, [data, fixed, practiceItems])

  const weaknesses = useMemo(
    () => aggregateWeaknesses(practiceItems),
    [practiceItems],
  )

  const conditions = useMemo(
    () => getRubricConditionsForTier(goalTier),
    [goalTier],
  )

  const focusOptions = useMemo(
    () => weaknesses.map((w) => w.tag),
    [weaknesses],
  )

  useEffect(() => {
    if (!selectedFocuses.length && focusOptions.length) {
      setSelectedFocuses([focusOptions[0]])
    }
  }, [focusOptions, selectedFocuses.length])

  useEffect(() => {
    if (!data || loading) return
    setDinoSpeech(
      buildMonitorBriefing({
        count: advancedProgress.count,
        goal: advancedProgress.goal,
        met: advancedProgress.met,
        fixed,
        primaryTier,
      }),
    )
    setActiveDino('observe')
  }, [data, loading]) // 僅在資料載入時給出初始觀察提示

  const recommendations = useMemo(() => {
    if (!submittedFocuses?.length) return []
    return recommendAssistants(practiceItems, submittedFocuses, {
      mode,
      primaryTier,
      limit: 2,
    })
  }, [practiceItems, submittedFocuses, mode, primaryTier, fixed])

  const handleToggleFocus = (tag) => {
    setSubmittedFocuses(null)
    setPickedId('')
    setUnlockedTo((prev) => Math.min(prev, 2))
    if (step === 3) setStep(2)
    setSelectedFocuses((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag)
      return [...prev, tag]
    })
  }

  const handleGoPlan = () => {
    goStep(
      2,
      buildPlanBriefing({ weaknesses, selectedFocuses }),
      'plan',
    )
  }

  const handleSubmitGoals = () => {
    if (!selectedFocuses.length) return
    setSubmittedFocuses([...selectedFocuses])
    setPickedId('')
    goStep(
      3,
      `行動｜已依「${selectedFocuses.join('、')}」找到推薦。選一間聊天室開始練吧！`,
      'act',
    )
  }

  const handlePick = (id) => {
    setPickedId(id)
    setSnackOpen(true)
    setDinoSpeech(
      '行動｜選好了！請回主系統練習；練完再點「翼手龍」從頭觀察進度。',
    )
    setActiveDino('act')
  }

  const handleDinoTap = (dino) => {
    setWiggleId(dino.id)
    window.setTimeout(() => setWiggleId(null), 500)

    const target = STEP_BY_DINO[dino.id] || 1

    if (target > unlockedTo) {
      setActiveDino(dino.id)
      if (target === 2) {
        setDinoSpeech('請先完成觀察，再按「下一步：策劃」。')
      } else {
        setDinoSpeech('請先在策劃勾選練習方向，再按「下一步：查看推薦」。')
      }
      return
    }

    if (dino.srlStep === 'monitor') {
      goStep(
        1,
        buildMonitorBriefing({
          count: advancedProgress.count,
          goal: advancedProgress.goal,
          met: advancedProgress.met,
          fixed,
          primaryTier,
        }),
        'observe',
      )
      return
    }

    if (dino.srlStep === 'plan') {
      if (!selectedFocuses.length && weaknesses[0]?.tag) {
        setSelectedFocuses([weaknesses[0].tag])
        setSubmittedFocuses(null)
        setPickedId('')
        setUnlockedTo((prev) => Math.min(prev, 2))
      }
      const nextSelected =
        selectedFocuses.length || !weaknesses[0]?.tag
          ? selectedFocuses
          : [weaknesses[0].tag]
      goStep(
        2,
        buildPlanBriefing({
          weaknesses,
          selectedFocuses: nextSelected,
        }),
        'plan',
      )
      return
    }

    // 行動：已解鎖才可進入
    goStep(
      3,
      buildActBriefing({
        selectedFocuses,
        submittedFocuses,
        recommendations,
        pickedId,
      }),
      'act',
    )
  }

  if (err) {
    return (
      <Card variant='outlined'>
        <CardContent>
          <Typography color='error' sx={{ fontWeight: 700 }}>
            讀取失敗
          </Typography>
          <Typography sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>{err}</Typography>
        </CardContent>
      </Card>
    )
  }

  const subtitle = fixed
    ? `請在主系統選擇「${SRL_GOAL_TIER}」練習；目標是 ${SRL_GOAL_ROOMS} 個聊天室達到「符合進階」`
    : `目標是 ${SRL_GOAL_ROOMS} 個聊天室等級到達「${SRL_GOAL_TIER}」；依弱點選擇練習方向`

  const rubricTitle = '進階等級條件'
  const rubricSubtitle = fixed
    ? `課程目標為「${SRL_GOAL_TIER}」。以下條件可對照；練習後希望系統判定為符合所選等級（in_band）。`
    : `課程目標為 ${SRL_GOAL_ROOMS} 個聊天室到達「${SRL_GOAL_TIER}」。你目前多數在「${primaryTier}」；以下可作為往進階靠近的對照。`

  return (
    <Box
      sx={{
        position: 'relative',
        '@media (prefers-reduced-motion: reduce)': {
          '& *': { animationDuration: '0.01ms !important', animationIterationCount: '1 !important' },
        },
      }}
    >
      <Box
        sx={{
          mb: 2.5,
          px: { xs: 2, sm: 2.5 },
          py: { xs: 2.25, sm: 2.75 },
          borderRadius: `${radii.xl}px`,
          border: '1.5px dashed',
          borderColor: tone.sand,
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: tone.wash,
          backgroundImage: `
            radial-gradient(ellipse 70% 55% at 92% 12%, ${tone.sky}aa 0%, transparent 55%),
            radial-gradient(ellipse 45% 40% at 6% 95%, ${tone.sageSoft} 0%, transparent 50%),
            radial-gradient(${tone.sand}35 1px, transparent 1px)
          `,
          backgroundSize: 'auto, auto, 16px 16px',
          boxShadow: '0 8px 22px rgba(74, 69, 63, 0.05)',
        }}
      >
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          alignItems={{ xs: 'center', sm: 'center' }}
          justifyContent='space-between'
          sx={{ position: 'relative', zIndex: 1 }}
        >
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              textAlign: { xs: 'center', sm: 'left' },
            }}
          >
            <Typography sx={type.pageTitle}>
              練習建議
            </Typography>
            <Typography
              variant='body2'
              sx={{
                color: tone.muted,
                mt: 0.75,
                maxWidth: 520,
                mx: { xs: 'auto', sm: 0 },
              }}
            >
              {subtitle}
            </Typography>

            <Stack
              direction='row'
              alignItems='center'
              spacing={0.75}
              justifyContent={{ xs: 'center', sm: 'flex-start' }}
              sx={{ mt: 1.5 }}
            >
              {[1, 2, 3].map((n, i) => {
                const done = n < step
                const current = n === step
                const unlocked = n <= unlockedTo
                return (
                  <Stack key={n} direction='row' alignItems='center' spacing={0.75}>
                    <Box
                      sx={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 11,
                        fontWeight: 800,
                        color: current || done ? '#fff' : unlocked ? tone.leaf : tone.muted,
                        bgcolor: current || done ? tone.leaf : unlocked ? tone.sageSoft : '#fff',
                        border: '1.5px solid',
                        borderColor: current || done ? tone.leaf : tone.line,
                      }}
                    >
                      {done ? '✓' : n}
                    </Box>
                    {i < 2 ? (
                      <Box
                        sx={{
                          width: 14,
                          height: 3,
                          borderRadius: `${radii.sm}px`,
                          bgcolor: n < step ? tone.leaf : tone.line,
                        }}
                      />
                    ) : null}
                  </Stack>
                )
              })}
            </Stack>

            <Box
              key={dinoSpeech}
              sx={{
                mt: 1.5,
                px: 1.6,
                py: 1.15,
                borderRadius: `${radii.lg}px`,
                bgcolor: '#fff',
                border: '1.5px dashed',
                borderColor: tone.sand,
                maxWidth: 440,
                mx: { xs: 'auto', sm: 0 },
                boxShadow: '0 4px 12px rgba(74, 69, 63, 0.04)',
                animation: `${speechPop} 0.4s ease`,
              }}
            >
              <Typography
                variant='body2'
                sx={{ color: tone.ink, fontWeight: 600, lineHeight: 1.45 }}
              >
                {dinoSpeech}
              </Typography>
              <Typography
                variant='caption'
                sx={{ color: tone.muted, display: 'block', mt: 0.5 }}
              >
                步驟 {step}／3：觀察 → 策劃 → 行動
              </Typography>
            </Box>
          </Box>

          <Stack
            direction='row'
            spacing={{ xs: 1.5, sm: 2 }}
            justifyContent='center'
            alignItems='flex-end'
            sx={{ flexShrink: 0 }}
          >
            {DINO_GUIDES.map((dino, i) => {
              const dinoStep = STEP_BY_DINO[dino.id]
              const locked = dinoStep > unlockedTo
              const isCurrent = step === dinoStep
              const idleAnim =
                dino.id === 'observe'
                  ? `${floatFly} 3s ease-in-out infinite`
                  : dino.id === 'plan'
                    ? `${sway} 2.8s ease-in-out infinite`
                    : `${bob} 2.4s ease-in-out infinite`
              return (
                <Tooltip
                  key={dino.id}
                  title={
                    locked
                      ? `${dino.name} · 尚未解鎖`
                      : `${dino.name}（${dino.latin}）· ${dino.role}`
                  }
                  arrow
                >
                  <Box
                    component='button'
                    type='button'
                    onClick={() => handleDinoTap(dino)}
                    aria-label={`${dino.name}：協助${dino.role}${locked ? '（尚未解鎖）' : ''}`}
                    sx={{
                      border: 'none',
                      background: 'transparent',
                      p: 0,
                      cursor: 'pointer',
                      textAlign: 'center',
                      opacity: locked ? 0.45 : 1,
                      transition: 'transform 0.18s ease',
                      '&:hover': {
                        transform: locked ? 'none' : 'translateY(-3px)',
                      },
                    }}
                  >
                    <Box
                      sx={{
                        width: { xs: 100, sm: 112 },
                        height: { xs: 100, sm: 112 },
                        mx: 'auto',
                        borderRadius: `${radii.lg}px`,
                        bgcolor: isCurrent ? '#fff' : 'rgba(255,255,255,0.45)',
                        border: isCurrent ? 'none' : '1.5px dashed',
                        borderColor: locked ? tone.line : tone.sand,
                        outline: isCurrent
                          ? `3px solid ${tone.leaf}`
                          : '3px solid transparent',
                        boxShadow: isCurrent
                          ? '0 6px 16px rgba(111, 143, 94, 0.18)'
                          : 'none',
                        display: 'grid',
                        placeItems: 'center',
                        transition:
                          'box-shadow 0.15s ease, outline-color 0.15s ease, background 0.15s ease',
                      }}
                    >
                      <Box
                        component='img'
                        src={dino.src}
                        alt={dino.alt}
                        sx={{
                          width: { xs: 82, sm: 94 },
                          height: { xs: 82, sm: 94 },
                          objectFit: 'contain',
                          display: 'block',
                          filter: locked ? 'grayscale(0.5)' : 'none',
                          animation:
                            wiggleId === dino.id
                              ? `${hop} 0.55s ease`
                              : locked
                                ? 'none'
                                : idleAnim,
                          animationDelay:
                            wiggleId === dino.id ? '0s' : `${i * 0.22}s`,
                        }}
                      />
                    </Box>
                    <Typography
                      variant='caption'
                      sx={{
                        display: 'block',
                        mt: 0.65,
                        fontWeight: 800,
                        color: tone.ink,
                        lineHeight: 1.1,
                        fontSize: { xs: 12, sm: 13 },
                      }}
                    >
                      {dino.name}
                    </Typography>
                    <Typography
                      variant='caption'
                      sx={{
                        display: 'inline-block',
                        mt: 0.3,
                        px: 1,
                        py: 0.2,
                        borderRadius: `${radii.sm}px`,
                        fontWeight: 800,
                        fontSize: 11,
                        color: '#fff',
                        bgcolor: locked
                          ? tone.sand
                          : isCurrent
                            ? tone.leaf
                            : tone.sage,
                      }}
                    >
                      {locked ? '未解鎖' : `${dinoStep}. ${dino.role}`}
                    </Typography>
                  </Box>
                </Tooltip>
              )
            })}
          </Stack>
        </Stack>
      </Box>

      {loading ? (
        <Box
          sx={{
            py: 8,
            display: 'grid',
            placeItems: 'center',
            gap: 1.5,
            animation: `${slideUp} 0.4s ease`,
          }}
        >
          <Stack direction='row' spacing={1.5} alignItems='flex-end'>
            {DINO_GUIDES.map((dino, i) => (
              <Box
                key={dino.id}
                component='img'
                src={dino.src}
                alt=''
                sx={{
                  width: 48 + i * 4,
                  height: 48 + i * 4,
                  objectFit: 'contain',
                  animation: `${bob} 1.2s ease-in-out infinite`,
                  animationDelay: `${i * 0.18}s`,
                }}
              />
            ))}
          </Stack>
          <CircularProgress sx={{ color: tone.leaf }} size={28} />
          <Typography variant='body2' sx={{ color: tone.muted, fontWeight: 600 }}>
            恐龍嚮導正在整理你的練習紀錄…
          </Typography>
        </Box>
      ) : (
        <Box ref={contentRef} sx={{ scrollMarginTop: 16 }}>
          {step === 1 ? (
            <SectionBlock
              key='step-observe'
              stepLabel='步驟 1 · 觀察 · 翼手龍'
              title={fixed ? '符合進階進度' : '到達進階進度'}
              hint={
                fixed
                  ? `選定「${SRL_GOAL_TIER}」且符合（in_band）；目標 ${SRL_GOAL_ROOMS} 個`
                  : `評估等級已達「${SRL_GOAL_TIER}」；目標 ${SRL_GOAL_ROOMS} 個`
              }
              dinoSrc={DINO.observe.src}
              dinoMotion='fly'
              delay={40}
            >
              <Stack spacing={2}>
                <Stack spacing={1.5}>
                  <Stack
                    direction='row'
                    alignItems='baseline'
                    spacing={1}
                    useFlexGap
                    flexWrap='wrap'
                  >
                    <Typography
                      variant='h4'
                      sx={{ fontWeight: 800, color: tone.ink }}
                    >
                      {advancedProgress.count} / {advancedProgress.goal}
                    </Typography>
                    {advancedProgress.met ? (
                      <Chip
                        size='small'
                        label='目標達成！'
                        sx={{
                          bgcolor: tone.sageSoft,
                          color: tone.sage,
                          fontWeight: 800,
                        }}
                      />
                    ) : null}
                  </Stack>
                  <ProgressTrail
                    count={advancedProgress.count}
                    goal={advancedProgress.goal}
                    met={advancedProgress.met}
                  />
                  <Typography variant='body2' sx={{ color: tone.muted }}>
                    {advancedProgress.met
                      ? fixed
                        ? '已達成課程目標：6 個聊天室符合進階。'
                        : '已達成課程目標：6 個聊天室等級到達進階。'
                      : fixed
                        ? `還差 ${Math.max(0, advancedProgress.goal - advancedProgress.count)} 個聊天室符合進階。`
                        : `還差 ${Math.max(0, advancedProgress.goal - advancedProgress.count)} 個聊天室到達進階。目前多數在「${primaryTier}」。`}
                    {fixed && fitSummary?.total
                      ? ` 最近練習：符合 ${fitSummary.matched} · 不符合 ${fitSummary.unmatched}。`
                      : null}
                    {fixed && !fitSummary?.total
                      ? ' 尚無適配紀錄時，請先在主系統選擇「進階」並完成評估。'
                      : null}
                  </Typography>
                </Stack>

                <Box
                  sx={{
                    pt: 1.75,
                    borderTop: '1px solid',
                    borderColor: tone.line,
                  }}
                >
                  <Typography
                    variant='subtitle1'
                    sx={{ fontWeight: 800, color: tone.ink, mb: 0.35 }}
                  >
                    {rubricTitle}
                  </Typography>
                  <Typography
                    variant='body2'
                    sx={{ color: tone.muted, mb: 1.25 }}
                  >
                    {rubricSubtitle}
                  </Typography>
                  {!fixed ? (
                    <Typography
                      variant='body2'
                      sx={{ color: tone.muted, mb: 1 }}
                    >
                      目前多數：{primaryTier} · 課程目標：{SRL_GOAL_TIER}
                    </Typography>
                  ) : null}
                  {conditions.map((c) => (
                    <ConditionRow key={c.id} condition={c} />
                  ))}
                </Box>

                <Box sx={{ pt: 0.5 }}>
                  <Button
                    variant='contained'
                    onClick={handleGoPlan}
                    sx={buttonPrimarySx}
                  >
                    下一步：策劃 →
                  </Button>
                </Box>
              </Stack>
            </SectionBlock>
          ) : null}

          {step === 2 ? (
            <SectionBlock
              key='step-plan'
              stepLabel='步驟 2 · 策劃 · 甲龍'
              title='這次我想優先練習'
              hint='先看常見弱點，再勾選這次要練的項目'
              dinoSrc={DINO.plan.src}
              dinoMotion='sway'
              delay={40}
            >
              <Stack spacing={2}>
                <Box>
                  <Typography
                    variant='subtitle1'
                    sx={{ fontWeight: 800, color: tone.ink, mb: 0.35 }}
                  >
                    常見弱點
                  </Typography>
                  <Typography
                    variant='body2'
                    sx={{ color: tone.muted, mb: 1 }}
                  >
                    點標籤可加入／取消下方勾選
                  </Typography>
                  {weaknesses.length ? (
                    <Stack
                      direction='row'
                      spacing={0.75}
                      useFlexGap
                      flexWrap='wrap'
                    >
                      {weaknesses.map((w) => {
                        const on = selectedFocuses.includes(w.tag)
                        return (
                          <Chip
                            key={w.tag}
                            clickable
                            onClick={() => handleToggleFocus(w.tag)}
                            label={`${w.tag}（${w.count}）`}
                            variant='outlined'
                            sx={{
                              borderColor: on ? tone.sage : tone.line,
                              bgcolor: on ? tone.sageSoft : '#fff',
                              color: tone.ink,
                              fontWeight: on ? 800 : 500,
                              transition: 'transform 0.15s ease',
                              '&:hover': { transform: 'scale(1.04)' },
                            }}
                          />
                        )
                      })}
                    </Stack>
                  ) : (
                    <Typography variant='body2' sx={{ color: tone.muted }}>
                      尚無評估紀錄；請先在主系統完成聊天並觸發評估。
                    </Typography>
                  )}
                </Box>

                <Box
                  sx={{
                    pt: 1.5,
                    borderTop: '1px solid',
                    borderColor: tone.line,
                  }}
                >
                  <Typography
                    variant='subtitle1'
                    sx={{ fontWeight: 800, color: tone.ink, mb: 0.35 }}
                  >
                    勾選這次要練的目標
                  </Typography>
                  <Typography
                    variant='body2'
                    sx={{ color: tone.muted, mb: 1 }}
                  >
                    可多選；選好後按下方按鈕進入下一步
                  </Typography>
                  {focusOptions.length ? (
                    <FormControl component='fieldset' sx={{ width: '100%' }}>
                      <Stack spacing={0.25}>
                        {focusOptions.map((tag) => (
                          <FormControlLabel
                            key={tag}
                            sx={{
                              mx: 0,
                              px: 1,
                              py: 0.35,
                              borderRadius: `${radii.sm}px`,
                              bgcolor: selectedFocuses.includes(tag)
                                ? tone.sageSoft
                                : 'transparent',
                              transition: 'background 0.2s ease',
                              '&:hover': { bgcolor: tone.wash },
                            }}
                            control={
                              <Checkbox
                                size='small'
                                checked={selectedFocuses.includes(tag)}
                                onChange={() => handleToggleFocus(tag)}
                                sx={{
                                  color: tone.muted,
                                  '&.Mui-checked': { color: tone.sage },
                                }}
                              />
                            }
                            label={
                              <Typography
                                sx={{ color: tone.ink, fontSize: 14 }}
                              >
                                {tag}
                              </Typography>
                            }
                          />
                        ))}
                      </Stack>
                    </FormControl>
                  ) : (
                    <Typography variant='body2' sx={{ color: tone.muted }}>
                      尚無弱點標籤可選；請先完成評估。
                    </Typography>
                  )}
                  <Stack
                    direction='row'
                    spacing={1.25}
                    useFlexGap
                    flexWrap='wrap'
                    sx={{ mt: 2 }}
                  >
                    <Button
                      variant='outlined'
                      onClick={() =>
                        goStep(
                          1,
                          buildMonitorBriefing({
                            count: advancedProgress.count,
                            goal: advancedProgress.goal,
                            met: advancedProgress.met,
                            fixed,
                            primaryTier,
                          }),
                          'observe',
                        )
                      }
                      sx={buttonSecondarySx}
                    >
                      上一步：觀察
                    </Button>
                    <Button
                      variant='contained'
                      onClick={handleSubmitGoals}
                      disabled={!selectedFocuses.length || !practiceItems.length}
                      sx={buttonPrimarySx}
                    >
                      下一步：查看推薦 →
                    </Button>
                  </Stack>
                </Box>
              </Stack>
            </SectionBlock>
          ) : null}

          {step === 3 ? (
            <SectionBlock
              key='step-act'
              stepLabel='步驟 3 · 行動 · 角龍'
              title='推薦聊天室'
              hint={
                fixed
                  ? '最多 2 個；優先推薦尚未符合「進階」的聊天室'
                  : '最多 2 個；優先推薦尚未到達「進階」的聊天室'
              }
              dinoSrc={DINO.act.src}
              dinoMotion='bob'
              delay={40}
            >
              <Stack spacing={2}>
                {!practiceItems.length ? (
                  <Typography variant='body2' sx={{ color: tone.muted }}>
                    尚無練習紀錄，無法產生推薦。
                  </Typography>
                ) : submittedFocuses === null ? (
                  <Typography variant='body2' sx={{ color: tone.muted }}>
                    請先回到策劃勾選練習目標。
                  </Typography>
                ) : !recommendations.length ? (
                  <Typography variant='body2' sx={{ color: tone.muted }}>
                    目前沒有符合所選目標的推薦，請試試其他組合。
                  </Typography>
                ) : (
                  <Stack spacing={1.5}>
                    {recommendations.map((item, idx) => (
                      <RecommendationCard
                        key={item.id || item.conversationId || item.assistantId}
                        item={item}
                        mode={mode}
                        index={idx}
                        selected={
                          pickedId === (item.conversationId || item.assistantId)
                        }
                        onSelect={handlePick}
                      />
                    ))}
                  </Stack>
                )}
                <Box>
                  <Button
                    variant='outlined'
                    onClick={() =>
                      goStep(
                        2,
                        buildPlanBriefing({
                          weaknesses,
                          selectedFocuses,
                        }),
                        'plan',
                      )
                    }
                    sx={buttonSecondarySx}
                  >
                    上一步：策劃
                  </Button>
                </Box>
              </Stack>
            </SectionBlock>
          ) : null}
        </Box>
      )}

      <Snackbar
        open={snackOpen}
        autoHideDuration={4000}
        onClose={() => setSnackOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity='success'
          variant='filled'
          onClose={() => setSnackOpen(false)}
          sx={{ borderRadius: `${radii.md}px`, fontWeight: 700, bgcolor: colors.leaf }}
        >
          已選擇此練習目標。請至主系統對應聊天室開始練習。
        </Alert>
      </Snackbar>
    </Box>
  )
}
