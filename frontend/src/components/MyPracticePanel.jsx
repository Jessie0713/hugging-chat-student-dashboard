import { useEffect, useMemo, useState } from 'react'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import ConversationProgressChart from './ConversationProgressChart'
import {
  classifyPracticeFit,
  displayTier,
  FIT_MATCH_COLOR,
  FIT_UNMATCH_COLOR,
  formatFitStatus,
  getFitStatusChipProps,
  TIER_ORDER,
} from '../lib/levelDisplay'

import { accordionCardSx, radii, type } from '../theme/tokens'

function formatShortDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })
}

function formatChatSubtitle(item) {
  const parts = []
  if (item.conversationTitle) parts.push(item.conversationTitle)
  const date = formatShortDate(item.updatedAt)
  if (date) parts.push(date)
  if (!parts.length) return ''
  return parts.join(' · ')
}

const fitToggleSx = {
  flexWrap: 'wrap',
  '& .MuiToggleButton-root': {
    color: 'text.secondary',
    border: '1px solid',
    borderColor: 'divider',
    fontSize: '0.75rem',
    fontWeight: 600,
    py: 0.5,
    px: 1.25,
    bgcolor: 'background.paper',
    '&:hover': { bgcolor: 'action.hover' },
  },
  '& .MuiToggleButton-root.Mui-selected': {
    fontWeight: 700,
    '&:hover': { opacity: 0.92 },
  },
  '& .MuiToggleButton-root[value="all"].Mui-selected': {
    bgcolor: 'primary.main',
    color: '#fff',
    borderColor: 'primary.main',
  },
  '& .MuiToggleButton-root[value="matched"].Mui-selected': {
    bgcolor: FIT_MATCH_COLOR,
    color: '#fff',
    borderColor: FIT_MATCH_COLOR,
  },
  '& .MuiToggleButton-root[value="unmatched"].Mui-selected': {
    bgcolor: FIT_UNMATCH_COLOR,
    color: '#fff',
    borderColor: FIT_UNMATCH_COLOR,
  },
}

const filterLabelSx = {
  fontWeight: 700,
  color: 'text.secondary',
  fontSize: '0.75rem',
  flexShrink: 0,
}

const filterPanelSx = {
  bgcolor: 'grey.50',
  borderRadius: `${radii.btn}px`,
  border: '1px solid',
  borderColor: 'divider',
  px: 1.5,
  py: 1.25,
  width: { xs: '100%', md: 'auto' },
  minWidth: { md: 280 },
  flexShrink: 0,
}

function PracticeFilterPanel({
  fitFilter,
  setFitFilter,
  tierFilter,
  setTierFilter,
  fitCounts,
  tierCounts,
  visibleTiers,
  loading,
  hasPractice,
  tierSelectDisabled,
  filterExpanded,
  onToggleExpanded,
}) {
  return (
    <Box sx={filterPanelSx}>
      <Stack spacing={1}>
        <Stack
          direction='row'
          alignItems='center'
          flexWrap='wrap'
          useFlexGap
          spacing={1}
        >
          <Typography component='span' sx={filterLabelSx}>
            適配狀態
          </Typography>
          <ToggleButtonGroup
            size='small'
            value={fitFilter}
            exclusive
            onChange={(_, v) => v && setFitFilter(v)}
            disabled={loading || !hasPractice}
            sx={{ ...fitToggleSx, flex: { xs: '1 1 auto', md: '0 1 auto' } }}
          >
            <ToggleButton value='all'>全部 ({fitCounts.all})</ToggleButton>
            <ToggleButton value='matched'>
              符合 ({fitCounts.matched})
            </ToggleButton>
            <ToggleButton value='unmatched'>
              不符合 ({fitCounts.unmatched})
            </ToggleButton>
          </ToggleButtonGroup>
          <Stack direction='row' alignItems='center' spacing={0.25} sx={{ ml: 'auto' }}>
            {!filterExpanded && tierFilter !== 'all' ? (
              <Chip
                size='small'
                label={tierFilter}
                sx={{
                  height: 22,
                  fontSize: '0.7rem',
                  bgcolor: 'background.paper',
                }}
              />
            ) : null}
            <IconButton
              size='small'
              onClick={onToggleExpanded}
              aria-label={filterExpanded ? '收起練習等級篩選' : '展開練習等級篩選'}
              aria-expanded={filterExpanded}
            >
              {filterExpanded ? (
                <ExpandLessRoundedIcon fontSize='small' />
              ) : (
                <ExpandMoreRoundedIcon fontSize='small' />
              )}
            </IconButton>
          </Stack>
        </Stack>

        <Collapse in={filterExpanded}>
          <Stack
            direction='row'
            alignItems='center'
            flexWrap='wrap'
            useFlexGap
            spacing={1}
            sx={{ pt: 0.25 }}
          >
            <Typography component='span' sx={filterLabelSx}>
              練習等級
            </Typography>
            <TextField
              select
              size='small'
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              disabled={loading || tierSelectDisabled}
              sx={{
                width: { xs: '100%', sm: 112 },
                flex: { xs: '1 1 100%', sm: '0 0 auto' },
                bgcolor: 'background.paper',
                '& .MuiInputBase-root': {
                  fontSize: '0.75rem',
                  height: 30,
                },
                '& .MuiSelect-select': {
                  py: 0.375,
                  px: 1,
                  minHeight: 'unset !important',
                },
              }}
              SelectProps={{
                displayEmpty: true,
                MenuProps: {
                  autoWidth: false,
                  PaperProps: {
                    sx: {
                      width: 112,
                      maxWidth: 112,
                      '& .MuiList-root': { py: 0.25 },
                      '& .MuiMenuItem-root': {
                        fontSize: '0.75rem',
                        minHeight: 28,
                        py: 0.25,
                        px: 1,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      },
                    },
                  },
                },
              }}
            >
              <MenuItem value='all' dense>
                全部 ({tierCounts.all})
              </MenuItem>
              {visibleTiers.map((tier) => (
                <MenuItem key={tier} value={tier} dense>
                  {tier} ({tierCounts[tier]})
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </Collapse>
      </Stack>
    </Box>
  )
}

function practiceTier(item) {
  return displayTier(item.levelKey, item.targetProductTier)
}

export default function MyPracticePanel({
  recentPractice = [],
  loading,
  source,
  mongoUserId,
}) {
  const theme = useTheme()
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'))
  const [fitFilter, setFitFilter] = useState('all')
  const [tierFilter, setTierFilter] = useState('all')
  const [filterExpanded, setFilterExpanded] = useState(false)

  const fitFiltered = useMemo(() => {
    if (fitFilter === 'all') return recentPractice
    return recentPractice.filter(
      (item) => classifyPracticeFit(item.fitStatus) === fitFilter,
    )
  }, [recentPractice, fitFilter])

  const filteredPractice = useMemo(() => {
    if (tierFilter === 'all') return fitFiltered
    return fitFiltered.filter((item) => practiceTier(item) === tierFilter)
  }, [fitFiltered, tierFilter])

  const fitCounts = useMemo(() => {
    let matched = 0
    let unmatched = 0
    for (const item of recentPractice) {
      if (classifyPracticeFit(item.fitStatus) === 'matched') matched += 1
      else unmatched += 1
    }
    return { matched, unmatched, all: recentPractice.length }
  }, [recentPractice])

  const tierCounts = useMemo(() => {
    const counts = { all: fitFiltered.length }
    for (const tier of TIER_ORDER) counts[tier] = 0
    for (const item of fitFiltered) {
      const tier = practiceTier(item)
      if (counts[tier] != null) counts[tier] += 1
    }
    return counts
  }, [fitFiltered])

  const visibleTiers = useMemo(
    () => TIER_ORDER.filter((tier) => tierCounts[tier] > 0),
    [tierCounts],
  )

  useEffect(() => {
    if (tierFilter !== 'all' && tierCounts[tierFilter] === 0) {
      setTierFilter('all')
    }
  }, [tierFilter, tierCounts])

  const hasPractice = recentPractice.length > 0
  const tierSelectDisabled = !hasPractice || visibleTiers.length === 0

  const filterSummary = useMemo(() => {
    if (loading || !hasPractice) return ''
    const tags = []
    if (fitFilter === 'matched') tags.push('符合等級')
    else if (fitFilter === 'unmatched') tags.push('不符合等級')
    if (tierFilter !== 'all') tags.push(tierFilter)
    const suffix = tags.length ? `（${tags.join(' · ')}）` : ''
    return `顯示 ${filteredPractice.length} 筆聊天${suffix}`
  }, [loading, hasPractice, fitFilter, tierFilter, filteredPractice.length])

  const filterPanel = (
    <PracticeFilterPanel
      fitFilter={fitFilter}
      setFitFilter={setFitFilter}
      tierFilter={tierFilter}
      setTierFilter={setTierFilter}
      fitCounts={fitCounts}
      tierCounts={tierCounts}
      visibleTiers={visibleTiers}
      loading={loading}
      hasPractice={hasPractice}
      tierSelectDisabled={tierSelectDisabled}
      filterExpanded={filterExpanded}
      onToggleExpanded={() => setFilterExpanded((v) => !v)}
    />
  )

  return (
    <Card variant='outlined' sx={{ borderRadius: `${radii.lg}px` }}>
      <CardContent>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent='space-between'
          alignItems={{ xs: 'stretch', md: 'flex-start' }}
          spacing={1.5}
          sx={{ mb: 1 }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={type.sectionTitle}>
              我的聊天練習
            </Typography>
            <Typography sx={{ ...type.subtitle, mt: 0.25 }}>
              查看每次練習是否符合所選等級
            </Typography>
          </Box>

          {isDesktop ? filterPanel : null}
        </Stack>

        {!isDesktop ? <Box sx={{ mb: 1 }}>{filterPanel}</Box> : null}

        {filterSummary ? (
          <Typography
            variant='caption'
            sx={{ opacity: 0.65, display: 'block', mb: 1 }}
          >
            {filterSummary}
          </Typography>
        ) : null}

        <Divider sx={{ mb: 1.5 }} />

        {loading ? (
          <Box sx={{ py: 3, display: 'grid', placeItems: 'center' }}>
            <CircularProgress size={22} />
          </Box>
        ) : recentPractice.length === 0 ? (
          <Typography variant='body2' sx={{ opacity: 0.7 }}>
            完成對話並觸發評估後會顯示在這裡
          </Typography>
        ) : filteredPractice.length === 0 ? (
          <Typography variant='body2' sx={{ opacity: 0.7 }}>
            目前沒有符合條件的聊天紀錄，試試改選「全部等級」或「全部」
          </Typography>
        ) : (
          <Stack spacing={1.2}>
            {filteredPractice.map((item) => {
              const advice = item.advice || {}
              const focus = Array.isArray(advice.focus) ? advice.focus : []
              const subtitle = formatChatSubtitle(item)
              const fitStatus = item.fitStatus

              return (
                <Accordion
                  key={item.conversationId}
                  disableGutters
                  elevation={0}
                  sx={{
                    ...accordionCardSx,
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreRoundedIcon />}
                    sx={{
                      bgcolor: 'grey.50',
                      '& .MuiAccordionSummary-content': { my: 0.5 },
                    }}
                  >
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography sx={{ fontWeight: 800 }}>
                        {item.assistantName || '未命名情境'}
                      </Typography>
                      {subtitle ? (
                        <Typography variant='caption' sx={{ opacity: 0.65 }}>
                          {subtitle}
                        </Typography>
                      ) : null}
                    </Box>
                  </AccordionSummary>

                  <AccordionDetails sx={{ pt: 1.25 }}>
                    <Stack
                      direction='row'
                      spacing={0.75}
                      useFlexGap
                      flexWrap='wrap'
                      sx={{ mb: 1 }}
                    >
                      {item.targetProductTier ? (
                        <Chip
                          size='small'
                          variant='outlined'
                          label={`選擇等級：${item.targetProductTier}`}
                        />
                      ) : null}
                      {fitStatus ? (
                        <Chip
                          size='small'
                          label={formatFitStatus(fitStatus)}
                          {...getFitStatusChipProps(fitStatus)}
                        />
                      ) : null}
                      {item.confidence != null ? (
                        <Chip
                          size='small'
                          variant='outlined'
                          color='info'
                          label={`信心 ${item.confidence}`}
                        />
                      ) : null}
                    </Stack>

                    {mongoUserId && item.conversationId ? (
                      <Box sx={{ mb: 1.5 }}>
                        <Typography
                          variant='subtitle2'
                          sx={{ ...type.subsection, mb: 0.25 }}
                        >
                          本次聊天進步
                        </Typography>
                        <Typography
                          variant='caption'
                          sx={{ opacity: 0.65, display: 'block', mb: 0.5 }}
                        >
                          橫軸：時間 · 縱軸：是否符合選定等級（綠＝符合、橘＝不符合）
                        </Typography>
                        <ConversationProgressChart
                          source={source}
                          mongoUserId={mongoUserId}
                          conversationId={item.conversationId}
                          targetProductTier={item.targetProductTier}
                          height={160}
                        />
                      </Box>
                    ) : null}

                    {focus.length ? (
                      <>
                        <Typography
                          variant='subtitle2'
                          sx={{ ...type.subsection, mb: 0.5 }}
                        >
                          需要加強
                        </Typography>
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {focus.slice(0, 8).map((f, i) => (
                            <li key={i}>
                              <Typography variant='body2'>{f}</Typography>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <Typography variant='body2' sx={{ opacity: 0.7 }}>
                        目前沒有常見錯誤/重點項目
                      </Typography>
                    )}
                    {advice.nextTask ? (
                      <Typography variant='body2' sx={{ mt: 1 }}>
                        <b>下一步任務：</b> {advice.nextTask}
                      </Typography>
                    ) : null}
                  </AccordionDetails>
                </Accordion>
              )
            })}
          </Stack>
        )}
      </CardContent>
    </Card>
  )
}
