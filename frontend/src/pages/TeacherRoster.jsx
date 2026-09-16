import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { BarChart } from '@mui/x-charts/BarChart'
import { PieChart } from '@mui/x-charts/PieChart'
import { apiGet } from '../lib/api'
import { teacherHeaders } from '../lib/teacherAuth'
import StudentBadgesDialog from '../components/StudentBadgesDialog'
import TeacherClassInsights, { CohortLegend, StatCard } from '../components/TeacherClassInsights'
import { TIER_COLORS, TIER_ORDER } from '../lib/levelDisplay'
import {
  buttonPrimarySx,
  buttonSecondarySx,
  colors,
  radii,
  type,
} from '../theme/tokens'

const SOURCE_LABEL = {
  rolling_level: '變動等級',
  fixed_level: '固定等級',
}

const TIER_CHART = [
  ...TIER_ORDER.map((id) => ({ id, color: TIER_COLORS[id] })),
  { id: '尚未評級', color: colors.sand },
]

const SCORE_HIST_LABELS = [
  '0–9',
  '10–19',
  '20–29',
  '30–39',
  '40–49',
  '50–59',
  '60–69',
  '70–79',
  '80–89',
  '90–99',
  '100+',
]

const compactBtn = {
  px: 1.2,
  py: 0.2,
  minWidth: 0,
  fontSize: 12,
}

const headCell = {
  fontWeight: 800,
  whiteSpace: 'nowrap',
  bgcolor: colors.paper,
}

const stickyLeftHead = {
  ...headCell,
  position: 'sticky',
  left: 0,
  zIndex: 5,
  boxShadow: '4px 0 8px rgba(74,69,63,0.1)',
}

const stickyRightHead = {
  ...headCell,
  position: 'sticky',
  right: 0,
  zIndex: 5,
  boxShadow: '-4px 0 8px rgba(74,69,63,0.1)',
}

const stickyLeftBody = {
  position: 'sticky',
  left: 0,
  zIndex: 2,
  fontWeight: 800,
  whiteSpace: 'nowrap',
  bgcolor: colors.paper,
  boxShadow: '4px 0 8px rgba(74,69,63,0.1)',
  'tr:hover &': { bgcolor: colors.wash },
}

const stickyRightBody = {
  position: 'sticky',
  right: 0,
  zIndex: 2,
  whiteSpace: 'nowrap',
  bgcolor: colors.paper,
  boxShadow: '-4px 0 8px rgba(74,69,63,0.1)',
  'tr:hover &': { bgcolor: colors.wash },
}

const midCell = { whiteSpace: 'nowrap' }

function pct(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

function num(v, digits = 2) {
  if (v == null || v === '') return '—'
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(digits) : '—'
}

function pctLabel(v) {
  const n = pct(v)
  return n == null ? '—' : `${n}%`
}

function sharePct(count, total) {
  const n = Number(total) || 0
  if (!n) return 0
  return Math.round((Number(count || 0) / n) * 1000) / 10
}

function CompareBarCard({ title, hint, categories, rolling, fixed, rollingCount, fixedCount }) {
  return (
    <Card
      variant='outlined'
      sx={{
        borderRadius: `${radii.lg}px`,
        bgcolor: colors.paper,
        borderColor: colors.line,
        height: '100%',
      }}
    >
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={0.75}
          alignItems={{ sm: 'center' }}
          justifyContent='space-between'
          sx={{ mb: 0.5 }}
        >
          <Typography sx={{ ...type.sectionTitle, fontSize: 18 }}>
            {title}
          </Typography>
          <CohortLegend rollingCount={rollingCount} fixedCount={fixedCount} variant='bar' />
        </Stack>
        {hint ? (
          <Typography sx={{ fontSize: 12, color: colors.muted, fontWeight: 700, mb: 0.25 }}>
            {hint}
          </Typography>
        ) : null}
        <BarChart
          xAxis={[
            {
              scaleType: 'band',
              data: categories,
              tickLabelStyle: { fontSize: 11 },
            },
          ]}
          yAxis={[
            {
              min: 0,
              tickLabelStyle: { fontSize: 11 },
              valueFormatter: (v) => `${v}%`,
            },
          ]}
          series={[
            {
              data: rolling,
              label: '變動等級',
              color: colors.leaf,
              valueFormatter: (v) => `${v ?? 0}%`,
            },
            {
              data: fixed,
              label: '固定等級',
              color: colors.wood,
              valueFormatter: (v) => `${v ?? 0}%`,
            },
          ]}
          height={240}
          margin={{ left: 36, right: 8, top: 12, bottom: 28 }}
          slots={{ legend: () => null }}
          slotProps={{ legend: { hidden: true } }}
        />
      </CardContent>
    </Card>
  )
}

function DonutCard({ title, items }) {
  const pieItems = items.filter((d) => d.value > 0)
  const pieData = pieItems.length
    ? pieItems
    : [{ id: 0, label: '無資料', value: 1, color: colors.line }]
  const pieColors = pieData.map((d) => d.color)

  return (
    <Card
      variant='outlined'
      sx={{
        borderRadius: `${radii.lg}px`,
        bgcolor: colors.paper,
        borderColor: colors.line,
        height: '100%',
      }}
    >
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography sx={{ ...type.sectionTitle, fontSize: 18, mb: 0.5 }}>
          {title}
        </Typography>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1.5,
            minHeight: 180,
          }}
        >
          <PieChart
            series={[
              {
                data: pieData,
                innerRadius: 36,
                outerRadius: 72,
                paddingAngle: 2,
                cornerRadius: 4,
                highlightScope: { fade: 'global', highlight: 'item' },
              },
            ]}
            colors={pieColors}
            width={170}
            height={180}
            hideLegend
            margin={{ top: 4, bottom: 4, left: 4, right: 4 }}
          />
          <Stack spacing={0.6} sx={{ minWidth: 96 }}>
            {pieData.map((item, i) => (
              <Stack key={item.label} direction='row' spacing={0.75} alignItems='center'>
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    bgcolor: pieColors[i],
                    flexShrink: 0,
                  }}
                />
                <Typography sx={{ fontWeight: 800, fontSize: 13, color: colors.ink }}>
                  {item.label}
                  {item.label !== '無資料' ? (
                    <Box component='span' sx={{ ml: 0.5, color: colors.muted, fontWeight: 700 }}>
                      {item.value}
                    </Box>
                  ) : null}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      </CardContent>
    </Card>
  )
}

export default function TeacherRoster() {
  const { source } = useParams()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [badgeStudent, setBadgeStudent] = useState(null)

  useEffect(() => {
    let cancelled = false
    setErr('')
    setData(null)
    apiGet(`/api/teacher/roster?source=${encodeURIComponent(source || 'rolling_level')}`, {
      headers: teacherHeaders(),
    })
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e.message || e))
      })
    return () => {
      cancelled = true
    }
  }, [source])

  const students = data?.students || []
  const summary = data?.summary || {}
  const hist = summary.scoreHistogram || {}
  const tierBuckets = summary.tierBuckets || {}

  const filtered = useMemo(() => {
    const needle = q.trim()
    if (!needle) return students
    return students.filter((s) => {
      const name = String(s.displayName || s.lastname || s.firstname || '').toLowerCase()
      const email = String(s.email || '').toLowerCase()
      const key = needle.toLowerCase()
      return name.includes(key) || email.includes(key)
    })
  }, [students, q])

  if (err) {
    return (
      <Typography color='error'>
        讀取失敗：{err}（請回首頁重新登入教師儀表板）
      </Typography>
    )
  }

  if (!data) {
    return (
      <Box sx={{ py: 8, display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    )
  }

  const kpis = [
    { title: '英文佔比', value: pct(summary.avgEnglishRatio) ?? 0, suffix: '%' },
    { title: '詞彙豐富度', value: num(summary.avgLexicalRichness) },
    { title: '平均輪次', value: num(summary.avgTurns) },
    { title: '平均時長', value: num(summary.avgDurationMin), suffix: ' 分' },
    { title: '平均總分', value: summary.avgTotalScore ?? 0 },
    { title: '總對話數', value: summary.conversationTotal ?? 0 },
  ]

  const levelPie = TIER_CHART.map((tier, id) => ({
    id,
    label: tier.id,
    value: tierBuckets[tier.id] || 0,
    color: tier.color,
  }))
  const scoreCounts = SCORE_HIST_LABELS.map((label) => hist[label] || 0)
  const emptyCols = source === 'all' ? 14 : 13
  const isAll = source === 'all'
  const rollingSummary = data?.byCohort?.rolling_level || {}
  const fixedSummary = data?.byCohort?.fixed_level || {}
  const rollingN = rollingSummary.studentCount || 0
  const fixedN = fixedSummary.studentCount || 0
  const rollingTiers = TIER_CHART.map((tier) =>
    sharePct((rollingSummary.tierBuckets || {})[tier.id], rollingN),
  )
  const fixedTiers = TIER_CHART.map((tier) =>
    sharePct((fixedSummary.tierBuckets || {})[tier.id], fixedN),
  )
  const rollingScores = SCORE_HIST_LABELS.map((label) =>
    sharePct((rollingSummary.scoreHistogram || {})[label], rollingN),
  )
  const fixedScores = SCORE_HIST_LABELS.map((label) =>
    sharePct((fixedSummary.scoreHistogram || {})[label], fixedN),
  )

  const compareCharts = (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems='stretch'>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <CompareBarCard
          title='等級分布'
          hint='佔該組人數比例'
          categories={TIER_CHART.map((t) => t.id)}
          rolling={rollingTiers}
          fixed={fixedTiers}
          rollingCount={rollingN}
          fixedCount={fixedN}
        />
      </Box>
      <Box sx={{ flex: 1.2, minWidth: 0 }}>
        <CompareBarCard
          title='成績分布'
          hint='佔該組人數比例'
          categories={SCORE_HIST_LABELS}
          rolling={rollingScores}
          fixed={fixedScores}
          rollingCount={rollingN}
          fixedCount={fixedN}
        />
      </Box>
    </Stack>
  )

  const singleCharts = (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems='stretch'>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <DonutCard title='等級分布' items={levelPie} />
      </Box>
      <Box sx={{ flex: 1.4, minWidth: 0 }}>
        <Card
          variant='outlined'
          sx={{
            borderRadius: `${radii.lg}px`,
            bgcolor: colors.paper,
            borderColor: colors.line,
            height: '100%',
          }}
        >
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography sx={{ ...type.sectionTitle, fontSize: 18, mb: 0.5 }}>
              成績分布
            </Typography>
            <BarChart
              xAxis={[
                {
                  scaleType: 'band',
                  data: SCORE_HIST_LABELS,
                  tickLabelStyle: { fontSize: 11 },
                },
              ]}
              yAxis={[{ tickMinStep: 1, tickLabelStyle: { fontSize: 11 } }]}
              series={[
                {
                  data: scoreCounts,
                  color: colors.leaf,
                  label: '人數',
                },
              ]}
              height={220}
              margin={{ left: 28, right: 8, top: 16, bottom: 28 }}
              slots={{ legend: () => null }}
              slotProps={{ legend: { hidden: true } }}
            />
          </CardContent>
        </Card>
      </Box>
    </Stack>
  )

  return (
    <Stack spacing={2}>
      <Typography sx={{ ...type.pageTitle, fontSize: { xs: 22, sm: 24 } }}>
        全體學生
      </Typography>

      <Grid container spacing={1.5}>
        {kpis.map((card) => (
          <Grid key={card.title} item size={{ xs: 6, sm: 4, md: 3, lg: 'grow' }}>
            <StatCard {...card} />
          </Grid>
        ))}
      </Grid>

      {isAll ? compareCharts : null}

      {isAll ? (
        <TeacherClassInsights
          source={source || 'rolling_level'}
          summary={{ ...summary, byCohort: data?.byCohort }}
          students={filtered}
          filterLabel=''
          hideKpis
          hideAi
        />
      ) : null}

      <Card
        variant='outlined'
        sx={{
          borderRadius: `${radii.lg}px`,
          bgcolor: colors.paper,
          borderColor: colors.line,
        }}
      >
        <CardContent sx={{ '&:last-child': { pb: 1.5 } }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.25}
            alignItems={{ sm: 'center' }}
            justifyContent='space-between'
            sx={{ mb: 1 }}
          >
            <Typography sx={{ ...type.sectionTitle, fontSize: 18 }}>
              學生名單
              <Box component='span' sx={{ ml: 1, fontWeight: 700, fontSize: 14, color: colors.muted }}>
                {filtered.length} 人
              </Box>
            </Typography>
            <TextField
              size='small'
              label='搜尋姓名或 email'
              value={q}
              onChange={(e) => setQ(e.target.value)}
              sx={{
                width: { xs: '100%', sm: 240 },
                bgcolor: colors.wash,
                borderRadius: `${radii.md}px`,
              }}
            />
          </Stack>

          <Box sx={{ overflowX: 'auto' }}>
            <Table size='small' stickyHeader sx={{ minWidth: 1180 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={stickyLeftHead}>姓名</TableCell>
                  <TableCell sx={headCell}>email</TableCell>
                  {source === 'all' ? (
                    <TableCell sx={headCell}>組別</TableCell>
                  ) : null}
                  <TableCell sx={headCell}>等級</TableCell>
                  <TableCell align='right' sx={headCell}>總分</TableCell>
                  <TableCell align='right' sx={headCell}>對話</TableCell>
                  <TableCell align='right' sx={headCell}>英文佔比</TableCell>
                  <TableCell align='right' sx={headCell}>詞彙豐富度</TableCell>
                  <TableCell align='right' sx={headCell}>平均輪次</TableCell>
                  <TableCell align='right' sx={headCell}>平均時長</TableCell>
                  <TableCell align='right' sx={headCell}>有效主題</TableCell>
                  <TableCell align='right' sx={headCell}>查看儀表板</TableCell>
                  <TableCell align='right' sx={headCell}>二次進階</TableCell>
                  <TableCell sx={stickyRightHead}>查看</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((s) => {
                  const tier = s.practiceTier || '尚未評級'
                  const tierColor = TIER_COLORS[tier] || colors.sand
                  return (
                    <TableRow key={`${s.source}-${s.hfUserId}`} hover>
                      <TableCell sx={stickyLeftBody}>
                        {s.displayName || '—'}
                      </TableCell>
                      <TableCell sx={midCell}>{s.email || '—'}</TableCell>
                      {source === 'all' ? (
                        <TableCell sx={midCell}>{SOURCE_LABEL[s.source] || s.source}</TableCell>
                      ) : null}
                      <TableCell sx={midCell}>
                        <Stack direction='row' spacing={0.75} alignItems='center'>
                          <Chip
                            size='small'
                            label={tier}
                            sx={{
                              fontWeight: 800,
                              bgcolor: tierColor,
                              color: '#fff',
                            }}
                          />
                          <Typography sx={{ fontSize: 12, color: colors.muted, fontWeight: 700 }}>
                            {s.levelKey || '—'}
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell align='right' sx={{ ...midCell, fontWeight: 800 }}>
                        {s.totalScore}
                      </TableCell>
                      <TableCell align='right' sx={midCell}>{s.conversationCount ?? 0}</TableCell>
                      <TableCell align='right' sx={midCell}>{pctLabel(s.englishRatio)}</TableCell>
                      <TableCell align='right' sx={midCell}>{num(s.lexicalRichness)}</TableCell>
                      <TableCell align='right' sx={midCell}>{num(s.avgTurns)}</TableCell>
                      <TableCell align='right' sx={midCell}>{num(s.avgDurationMin)}</TableCell>
                      <TableCell align='right' sx={midCell}>{s.completedTopicCount}/8</TableCell>
                      <TableCell align='right' sx={midCell}>{s.dashboardUsageCount}</TableCell>
                      <TableCell align='right' sx={midCell}>{s.secondAdvancedCount}/5</TableCell>
                      <TableCell sx={stickyRightBody}>
                        <Stack direction='row' spacing={0.5}>
                          <Button
                            size='small'
                            component={RouterLink}
                            to={`/${s.source}/student/${s.hfUserId}/overview`}
                            target='_blank'
                            rel='noreferrer'
                            sx={{ ...buttonPrimarySx, ...compactBtn }}
                          >
                            總覽
                          </Button>
                          <Button
                            size='small'
                            component={RouterLink}
                            to={`/${s.source}/student/${s.hfUserId}/conversations`}
                            target='_blank'
                            rel='noreferrer'
                            sx={{ ...buttonSecondarySx, ...compactBtn }}
                          >
                            聊天
                          </Button>
                          <Button
                            size='small'
                            onClick={() => setBadgeStudent(s)}
                            sx={{ ...buttonSecondarySx, ...compactBtn }}
                          >
                            成績
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={emptyCols}>沒有符合的學生</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>

      {isAll ? null : singleCharts}

      <TeacherClassInsights
        source={source || 'rolling_level'}
        summary={isAll ? { ...summary, byCohort: data?.byCohort } : summary}
        students={filtered}
        filterLabel=''
        hideKpis
        hideTrend={Boolean(isAll)}
      />

      <StudentBadgesDialog
        open={Boolean(badgeStudent)}
        onClose={() => setBadgeStudent(null)}
        source={badgeStudent?.source}
        hfUserId={badgeStudent?.hfUserId}
        displayName={badgeStudent?.displayName}
      />
    </Stack>
  )
}
