import {
  cefrToTier,
  classifyPracticeFit,
  displayTier,
  TIER_ORDER,
} from './levelDisplay'
import { isFixedLevelSource } from './badgeDefinitions'

/** 與 Chat UI 評估 advice.focus 對齊的「標準弱點類」——顯示與勾選用這層 */
export const FOCUS_TAGS = [
  '描述需求',
  '修正表達',
  '情境對話',
  '回應技巧',
  '敘事清晰度',
  '詞彙選擇',
]

/**
 * 評估常吐出近義詞（細節描述／具體細節…）。
 * 顯示前先歸到 FOCUS_TAGS，避免學生看到一堆意思相同的碎片標籤。
 */
const FOCUS_ALIASES = {
  描述需求: [
    '描述需求',
    '細節描述',
    '具體描述',
    '具體細節',
    '補充細節',
    '描述細節',
    '加入細節',
    '細節不足',
    '具體說明',
    '說清楚細節',
  ],
  修正表達: [
    '修正表達',
    '語法精確度',
    '文法精確',
    '句子結構',
    '完整句子',
    '語句完整',
    '表達修正',
    '文法正確',
    '語法正確',
  ],
  情境對話: [
    '情境對話',
    '語氣自然度',
    '語句流暢度',
    '自然語氣',
    '流暢度',
    '對話流暢',
    '自然表達',
    '語氣自然',
  ],
  回應技巧: [
    '回應技巧',
    '簡短看法',
    '表達看法',
    '意見表達',
    '接話',
    '回答問題',
    '清楚回應',
  ],
  敘事清晰度: [
    '敘事清晰度',
    '具體執行步驟',
    '具體做法',
    '流程敘述',
    '步驟說明',
    '說明原因',
    '因果說明',
    '說清楚流程',
  ],
  詞彙選擇: [
    '詞彙選擇',
    '用詞精確',
    '精準用詞',
    '用字精確',
    '詞彙豐富',
    '用詞精準',
  ],
}

const FOCUS_META = {
  描述需求: {
    keywords: ['描述', '需求', '完整句', '形容詞', '點餐', '細節'],
    practiceTip: '練習用完整句子描述需求，並加入具體細節。',
  },
  修正表達: {
    keywords: ['修正', '表達', '完整', '句子', '文法', '語法', '結構'],
    practiceTip: '注意句子結構完整，避免語句中斷或片語式回答。',
  },
  情境對話: {
    keywords: ['情境', '對話', '互動', '場景', '銜接', '流暢', '語氣', '自然'],
    practiceTip: '在情境中練習自然接話，讓回答與對話流程連貫。',
  },
  回應技巧: {
    keywords: ['回應', '互動', '輪次', '接話', '反應', '看法', '意見'],
    practiceTip: '練習針對問題給出清楚、相關的回應。',
  },
  敘事清晰度: {
    keywords: ['敘事', '清楚', '因果', 'because', '解釋', '流程', '步驟', '做法'],
    practiceTip: '嘗試使用 because、so 或 when，讓說明更清楚。',
  },
  詞彙選擇: {
    keywords: ['詞彙', '用字', '用詞', '形容詞', '具體', '豐富', '精確', '精準'],
    practiceTip: '在回答中加入更精準或具體的詞彙。',
  },
}

/**
 * 把評估的原始 focus 字串歸到標準類。
 * 對不上已知類時保留原文（仍顯示，但不強行塞錯類）。
 */
export function canonicalizeFocusTag(raw) {
  const t = String(raw || '').trim()
  if (!t) return null
  if (FOCUS_TAGS.includes(t)) return t

  for (const canon of FOCUS_TAGS) {
    const aliases = FOCUS_ALIASES[canon] || []
    if (aliases.some((a) => a === t)) return canon
  }

  // 部分包含：例如「加強細節描述」→ 描述需求
  for (const canon of FOCUS_TAGS) {
    const aliases = FOCUS_ALIASES[canon] || []
    if (aliases.some((a) => a !== canon && (t.includes(a) || a.includes(t)))) {
      return canon
    }
  }

  for (const canon of FOCUS_TAGS) {
    const kws = FOCUS_META[canon]?.keywords || []
    if (kws.some((kw) => t.includes(kw))) return canon
  }

  return t
}

/** 四大階 rubric（學習者文案，不含內部代碼） */
const RUBRIC_BY_TIER = {
  入門: [
    {
      id: 'entry_short',
      name: '極短完整表達',
      description: '能用很短的話回應情境，說出眼前相關的事物或需求。',
    },
    {
      id: 'entry_concrete',
      name: '具體日常詞彙',
      description: '使用具體、日常的詞（如食物、家人、學校），避免抽象說法。',
    },
    {
      id: 'entry_present',
      name: '現在的簡單說法',
      description: '以現在發生的事為主，用非常簡單的句子溝通。',
    },
    {
      id: 'entry_friendly',
      name: '清楚、友善的回應',
      description: '用清楚、友善的語氣回應，讓對方能猜到你的意思。',
    },
  ],
  基礎: [
    {
      id: 'basic_sentence',
      name: '完整短句',
      description: '能用完整短句說明誰／什麼／在哪裡，而不只說單字。',
    },
    {
      id: 'basic_detail',
      name: '補充一點細節',
      description: '能加上時間、感覺、數量等簡單細節。',
    },
    {
      id: 'basic_connect',
      name: '簡單連接',
      description: '能用 and、but 串起兩個想法；開始用 because 說明一個原因。',
    },
    {
      id: 'basic_describe',
      name: '具體描述',
      description: '能用具體名詞與簡單形容詞描述眼前或日常情境。',
    },
  ],
  進階: [
    {
      id: 'adv_connectors',
      name: '因果連接詞',
      description:
        '能使用 because、when、if、so 等連接詞，連結想法或說明原因。',
    },
    {
      id: 'adv_opinions',
      name: '簡單意見表達',
      description: '能以簡單方式表達個人看法或偏好。',
    },
    {
      id: 'adv_clause',
      name: '單一附屬子句',
      description:
        '允許一個附屬子句；句子可稍長，但避免過度複雜或多層從句。',
    },
    {
      id: 'adv_explain',
      name: '解釋能力',
      description: '能連結現象與原因，把「為什麼」說清楚。',
    },
    {
      id: 'adv_process',
      name: '流程敘述',
      description:
        '能說明步驟或流程，運用 First、Next、Then、Finally 等順序連接詞。',
    },
  ],
  高階: [
    {
      id: 'high_flexible',
      name: '靈活句型',
      description: '能依情境靈活變換句型，表達更精確。',
    },
    {
      id: 'high_nuance',
      name: '細緻用詞',
      description: '能使用較精確、抽象的詞彙說明複雜想法。',
    },
    {
      id: 'high_argue',
      name: '分析與提案',
      description: '能比較利弊、提出具體做法，並說明預期結果。',
    },
    {
      id: 'high_discourse',
      name: '連貫論述',
      description: '能用清楚的論述標記組織較長的說明。',
    },
  ],
}

export function getRubricConditionsForTier(tier) {
  if (tier && RUBRIC_BY_TIER[tier]) return RUBRIC_BY_TIER[tier]
  return RUBRIC_BY_TIER['基礎']
}

export function flattenRatedAssistants(cefrGroups = []) {
  return (Array.isArray(cefrGroups) ? cefrGroups : [])
    .flatMap((g) => g.assistants || [])
    .map((a) => ({
      assistantId: a.assistantId,
      assistantName: a.assistantName || a.assistantId,
      assistantDescription: a.assistantDescription || '',
      levelKey: a.levelKey,
      nextLevelKey: a.nextLevelKey,
      confidence: a.confidence,
      advice: a.advice || {},
      updatedAt: a.updatedAt,
      targetProductTier: null,
      fitStatus: null,
    }))
    .sort((a, b) => {
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return tb - ta
    })
}

/** fixed_level：每一筆對話＝一個可推薦的「聊天室」，不依 assistant 去重 */
export function flattenRecentPractice(recentPractice = []) {
  return [...(Array.isArray(recentPractice) ? recentPractice : [])]
    .map((item) => ({
      assistantId: item.assistantId || item.conversationId,
      assistantName: item.assistantName || item.assistantId || '未命名情境',
      assistantDescription: item.assistantDescription || '',
      conversationTitle: item.conversationTitle || null,
      conversationId: item.conversationId || null,
      levelKey: item.levelKey,
      nextLevelKey: item.nextLevelKey,
      confidence: item.confidence,
      advice: item.advice || {},
      updatedAt: item.updatedAt,
      targetProductTier: item.targetProductTier || null,
      fitStatus: item.fitStatus || null,
    }))
    .sort((a, b) => {
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return tb - ta
    })
}

function collectFocusList(items) {
  const out = []
  for (const a of items) {
    const focus = a?.advice?.focus
    if (Array.isArray(focus)) {
      for (const f of focus) {
        if (f && String(f).trim()) out.push(String(f).trim())
      }
    }
  }
  return out
}

function textMatchesFocus(text, focusTag) {
  const canon = canonicalizeFocusTag(focusTag) || focusTag
  const meta = FOCUS_META[canon]
  if (!text || !meta) return false
  const lower = String(text).toLowerCase()
  return meta.keywords.some(
    (kw) => lower.includes(kw.toLowerCase()) || text.includes(kw),
  )
}

/** 聊天室 advice.focus 是否命中所選標準弱點（含近義原文） */
function adviceFocusHits(focusList, selectedFocus) {
  const selected = canonicalizeFocusTag(selectedFocus) || selectedFocus
  return focusList.some((raw) => {
    const t = String(raw || '').trim()
    if (!t) return false
    if (t === selectedFocus || t === selected) return true
    return canonicalizeFocusTag(t) === selected
  })
}

export function aggregateWeaknesses(items = []) {
  const counts = new Map()
  const examples = new Map()
  for (const raw of collectFocusList(items)) {
    const tag = canonicalizeFocusTag(raw) || raw
    counts.set(tag, (counts.get(tag) || 0) + 1)
    if (!examples.has(tag)) examples.set(tag, new Set())
    if (raw !== tag) examples.get(tag).add(raw)
  }
  // 標準類依 FOCUS_TAGS 順序優先；其餘按次數
  return [...counts.entries()]
    .map(([tag, count]) => ({
      tag,
      count,
      examples: [...(examples.get(tag) || [])],
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      const ia = FOCUS_TAGS.indexOf(a.tag)
      const ib = FOCUS_TAGS.indexOf(b.tag)
      if (ia >= 0 && ib >= 0) return ia - ib
      if (ia >= 0) return -1
      if (ib >= 0) return 1
      return String(a.tag).localeCompare(String(b.tag), 'zh-Hant')
    })
}

/** rolling：以最近評級的眾數大階為「目前等級」 */
export function inferRollingPrimaryTier(items = []) {
  if (!items.length) return '基礎'
  const counts = new Map()
  for (const a of items) {
    const tier = cefrToTier(a.levelKey)
    if (!TIER_ORDER.includes(tier)) continue
    counts.set(tier, (counts.get(tier) || 0) + 1)
  }
  if (!counts.size) return '基礎'
  return [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]
    return TIER_ORDER.indexOf(b[0]) - TIER_ORDER.indexOf(a[0])
  })[0][0]
}

/** fixed：以最近練習最常見的「所選等級」為主 */
export function inferFixedPrimaryTier(items = []) {
  if (!items.length) return '基礎'
  const counts = new Map()
  for (const a of items) {
    const tier = displayTier(a.levelKey, a.targetProductTier)
    if (!TIER_ORDER.includes(tier)) continue
    counts.set(tier, (counts.get(tier) || 0) + 1)
  }
  if (!counts.size) return '基礎'
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

export function summarizeFit(items = []) {
  let matched = 0
  let unmatched = 0
  for (const a of items) {
    if (!a.fitStatus) continue
    if (classifyPracticeFit(a.fitStatus) === 'matched') matched += 1
    else unmatched += 1
  }
  return { matched, unmatched, total: matched + unmatched }
}

/** 自我調節共同目標：6 個聊天室到達「進階」 */
export const SRL_GOAL_TIER = '進階'
export const SRL_GOAL_ROOMS = 6

function normalizeFitKey(fitStatus) {
  return String(fitStatus || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
}

export function isFixedAdvancedMetRoom(item) {
  const target = String(item?.targetProductTier || '').trim()
  if (target !== SRL_GOAL_TIER) return false
  const assessed = cefrToTier(item?.levelKey)
  return TIER_ORDER.indexOf(assessed) >= TIER_ORDER.indexOf(SRL_GOAL_TIER)
}

/** Fixed 課程達標：選進階＋評估≥進階＋有效對話完成 */
export function isFixedCourseMetRoom(item) {
  return isFixedAdvancedMetRoom(item) && isEffectiveRoundComplete(item)
}

/** @deprecated 請用 isFixedAdvancedMetRoom */
export function isAdvancedInBandRoom(item) {
  return isFixedAdvancedMetRoom(item)
}

/** fixed／rolling：主題鍵＝assistant（情境） */
function themeIdOf(item) {
  const id = item?.assistantId || item?.conversationId
  return id != null && String(id) ? String(id) : ''
}

/** fixed：課程達標主題（assistant 各最多一次） */
export function collectFixedAdvancedThemeIds(items = []) {
  const ids = new Set()
  for (const item of items) {
    if (!isFixedCourseMetRoom(item)) continue
    const tid = themeIdOf(item)
    if (tid) ids.add(tid)
  }
  return ids
}

/**
 * fixed fallback：不同主題「選進階＋評估≥進階＋有效對話」
 * 正式進度以後端 advancedFitProgress 為準
 */
export function summarizeAdvancedFitProgress(
  items = [],
  goal = SRL_GOAL_ROOMS,
) {
  const ids = collectFixedAdvancedThemeIds(items)
  const count = ids.size
  return {
    tier: SRL_GOAL_TIER,
    count,
    goal,
    met: count >= goal,
    mode: 'fixed',
    themeIds: [...ids],
  }
}

/** rolling：評估大階已達進階（含高階）——程度判斷，不含有效對話 */
export function isRollingAdvancedRoom(item) {
  const tier = cefrToTier(item?.levelKey)
  return TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(SRL_GOAL_TIER)
}

/** 評估大階是否已達進階／高階（不論是否選進階） */
export function isAssessedAdvanced(item) {
  return isRollingAdvancedRoom(item)
}

export function isEffectiveRoundComplete(item) {
  return Boolean(item?.effectiveRoundComplete)
}

/** Rolling 課程達標：評估≥進階＋有效對話完成 */
export function isRollingCourseMetRoom(item) {
  return isRollingAdvancedRoom(item) && isEffectiveRoundComplete(item)
}

/**
 * 從 overview 的 badge.stats / badgeTopicDetails 建 assistant → 有效輪是否完成
 */
export function buildEffectiveRoundMap(badgeStats, topicDetails = []) {
  const map = new Map()
  const per = badgeStats?.perAssistant
  if (per && typeof per === 'object') {
    for (const [aid, info] of Object.entries(per)) {
      if (!info || typeof info !== 'object') continue
      map.set(String(aid), Boolean(info.effectiveRoundComplete))
    }
  }
  for (const t of topicDetails || []) {
    if (t?.assistantId == null) continue
    map.set(String(t.assistantId), Boolean(t.effectiveRoundComplete))
  }
  return map
}

/** 把有效輪狀態掛到練習項目上（推薦排序用） */
export function withEffectiveRound(items = [], effectiveByAssistant) {
  const map =
    effectiveByAssistant instanceof Map
      ? effectiveByAssistant
      : buildEffectiveRoundMap({ perAssistant: effectiveByAssistant || {} })
  return (Array.isArray(items) ? items : []).map((item) => {
    const tid = themeIdOf(item)
    return {
      ...item,
      effectiveRoundComplete:
        tid && map.has(tid) ? Boolean(map.get(tid)) : false,
    }
  })
}

/**
 * rolling：聊天室達標＝評估≥進階＋有效對話完成
 */
export function summarizeRollingAdvancedProgress(
  items = [],
  goal = SRL_GOAL_ROOMS,
) {
  const ids = new Set()
  for (const item of items) {
    if (!isRollingCourseMetRoom(item)) continue
    const id = item.assistantId || item.conversationId
    if (id) ids.add(String(id))
  }
  const count = ids.size
  return {
    tier: SRL_GOAL_TIER,
    count,
    goal,
    met: count >= goal,
    mode: 'rolling',
  }
}

export const NEXT_TIER = {
  入門: '基礎',
  基礎: '進階',
  進階: '高階',
  高階: '高階',
}

export function getNextTier(tier) {
  if (!tier || !NEXT_TIER[tier]) return '基礎'
  return NEXT_TIER[tier]
}

/** 單一 focus 與聊天室的相關分數（Fixed / Rolling 共用） */
function scoreFocusMatch(item, selectedFocus) {
  const advice = item.advice || {}
  const focus = Array.isArray(advice.focus) ? advice.focus : []
  const nextTask = advice.nextTask || ''
  const desc = item.assistantDescription || ''
  const name = item.assistantName || ''

  let score = 0
  if (adviceFocusHits(focus, selectedFocus)) score += 5
  if (textMatchesFocus(nextTask, selectedFocus)) score += 3
  if (textMatchesFocus(desc, selectedFocus)) score += 2
  if (textMatchesFocus(name, selectedFocus)) score += 1
  return score
}

/** 勾選多個 focus：各別計分後加總（只算相關度，不含模式優先） */
function scoreFocusTotal(item, focuses) {
  return focuses.reduce((sum, f) => sum + scoreFocusMatch(item, f), 0)
}

/**
 * Rolling 專屬、每個聊天室只加一次（不跟 focus 次數相乘）
 * Fixed 不靠這層分數，改用 rank 分桶排序
 */
function scoreRollingBonus(item) {
  let score = 0
  const tier = cefrToTier(item.levelKey)
  const ti = TIER_ORDER.indexOf(tier)
  const goalIdx = TIER_ORDER.indexOf('進階')
  if (ti >= 0 && ti < goalIdx) score += 6
  if (typeof item.confidence === 'number' && item.confidence < 0.85) {
    score += 0.5
  }
  return score
}

function matchedFocusOnItem(item, selectedFocusList) {
  const adviceFocus = item.advice?.focus || []
  return selectedFocusList.filter((f) => adviceFocusHits(adviceFocus, f))
}

function sceneHint(item) {
  return String(item.assistantDescription || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function tierIndex(tier) {
  return TIER_ORDER.indexOf(tier)
}

/** 依「這個聊天室」決定要往哪靠近，避免「已是進階卻說往進階靠近」 */
function rollingBenefitText(item, primaryTier) {
  const current = cefrToTier(item.levelKey)
  const roomNext = cefrToTier(item.nextLevelKey)
  const overallNext = getNextTier(primaryTier)

  let goal = overallNext
  if (roomNext && roomNext !== '未知' && roomNext !== current) {
    goal = roomNext
  }

  if (!current || current === '未知') {
    return `有助於往「${goal}」靠近`
  }

  // 此情境已達目標階（或更高）→ 改說再熟練／精煉
  if (tierIndex(current) >= tierIndex(goal) && tierIndex(goal) >= 0) {
    if (current === '高階') return `你在這裡已是「高階」，適合再精煉`
    return `你在這裡已是「${current}」，適合再熟練、說得更穩`
  }

  return `你在這裡目前是「${current}」，有助於往「${goal}」靠近`
}

/**
 * 推薦原因：口語、好選；不寫 nextTask（留給練習重點）
 */
function buildReason(item, selectedFocusList, mode, primaryTier) {
  const matched = matchedFocusOnItem(item, selectedFocusList)
  const chosen = selectedFocusList.join('、')
  const hit = matched.join('、')
  const scene = sceneHint(item)
  const where = scene || '這個情境'

  if (mode === 'fixed') {
    const target = String(item.targetProductTier || '').trim() || primaryTier
    const assessed = cefrToTier(item.levelKey)
    const rank = fixedRecommendRank(item, null)

    if (rank === 0) {
      return matched.length
        ? `想練「${hit}」優先回「${where}」：已選進階且程度達「${assessed}」，還差有效對話，快補完最划算。`
        : `想練「${chosen}」優先回「${where}」：已選進階且程度達「${assessed}」，還差有效對話，快補完最划算。`
    }
    if (rank === 1) {
      return matched.length
        ? `想練「${hit}」可回「${where}」：上次選進階，評估還在「${assessed}」，往課程目標前進。`
        : `想練「${chosen}」可回「${where}」：上次選進階，評估還在「${assessed}」，往課程目標前進。`
    }
    if (rank === 2) {
      return matched.length
        ? `「${where}」上次選「${target}」，評估是「${assessed}」還沒到；適合接著練「${hit}」。`
        : `「${where}」上次選「${target}」，評估是「${assessed}」還沒到；適合接著練「${chosen}」。`
    }
    if (rank === 4) {
      return matched.length
        ? `「${where}」程度與有效對話都已到位；若要再練「${hit}」可當複習。`
        : `「${where}」程度與有效對話都已到位；用「${chosen}」再練可當複習。`
    }
    return matched.length
      ? `「${where}」對上你想練的「${hit}」，下次記得選「進階」往課程目標前進。`
      : `「${where}」適合練「${chosen}」，下次記得選「進階」往課程目標前進。`
  }

  // rolling：變動等級（目標階依「這個情境」判斷）
  const benefit = rollingBenefitText(item, primaryTier)

  if (matched.length) {
    return `想練「${hit}」的話，優先選「${where}」：上次評估也點到這項，練起來最對症。${benefit}。`
  }
  return `想練「${chosen}」的話，可以選「${where}」：適合接著練。${benefit}。`
}

function buildPracticeFocus(item, selectedFocusList) {
  const nextTask = item.advice?.nextTask
  if (
    nextTask &&
    String(nextTask).trim() &&
    selectedFocusList.some((f) => textMatchesFocus(nextTask, f))
  ) {
    return String(nextTask).trim()
  }
  const tips = selectedFocusList
    .map((f) => FOCUS_META[f]?.practiceTip)
    .filter(Boolean)
  if (tips.length) return tips.join(' ')
  return '請嘗試用完整句子回答，並針對情境多說一點細節。'
}

/**
 * Fixed 推薦優先序（數字越小越前面）
 * 0＝選進階＋評估≥進階，但有效對話尚未完成（最划算、最優先）
 * 1＝選進階但評估仍＜進階
 * 2＝選了等級但評估未達選定
 * 3＝其他尚未完成者
 * 4＝課程已達標（選進階＋評估≥進階＋有效對話完成）（最後）
 */
function fixedRecommendRank(item, advancedThemes) {
  const tid = themeIdOf(item)
  const target = String(item?.targetProductTier || '').trim()
  const assessed = cefrToTier(item?.levelKey)
  const tIdx = tierIndex(target)
  const aIdx = tierIndex(assessed)
  const goalIdx = tierIndex(SRL_GOAL_TIER)
  const selectedAdvanced = target === SRL_GOAL_TIER
  const assessedAdvanced =
    (aIdx >= 0 && goalIdx >= 0 && aIdx >= goalIdx) ||
    isFixedAdvancedMetRoom(item)

  // 後端 themeIds＝已含有效對話的課程達標主題
  const themeCourseMet = Boolean(
    advancedThemes && tid && advancedThemes.has(tid),
  )
  if (themeCourseMet || isFixedCourseMetRoom(item)) return 4

  // 選進階＋程度已到，只差有效對話 → 最前
  if (selectedAdvanced && assessedAdvanced && !isEffectiveRoundComplete(item)) {
    return 0
  }
  // 選進階但程度未到
  if (selectedAdvanced && aIdx >= 0 && aIdx < goalIdx) return 1
  // 選了其他等級、評估未達選定
  if (tIdx >= 0 && aIdx >= 0 && aIdx < tIdx) return 2
  return 3
}

/**
 * 推薦流程（三步，Fixed / Rolling 相同骨架）：
 * 1. focus 共用計分：每個勾選 focus 個別算相關分，再加總
 * 2. 模式個別：Fixed 用 rank 分桶；Rolling 加一次課程相關 bonus
 * 3. 排序：先 rank（越小越前），同分再比 score；同一主題最多 1 筆
 *
 * @param {object[]} items 正規化後的聊天室／對話列表
 * @param {string[]} selectedFocusList
 * @param {{ mode?: 'rolling'|'fixed', primaryTier?: string, limit?: number, advancedThemeIds?: string[] }} options
 */
export function recommendAssistants(items = [], selectedFocusList = [], options = {}) {
  const focuses = (Array.isArray(selectedFocusList) ? selectedFocusList : [])
    .map((f) => String(f).trim())
    .filter(Boolean)
  const mode = options.mode === 'fixed' ? 'fixed' : 'rolling'
  const primaryTier = options.primaryTier || '基礎'
  const limit = options.limit != null ? options.limit : 2

  if (!focuses.length || !items.length) return []

  const fixedAdvancedThemes =
    mode === 'fixed'
      ? Array.isArray(options.advancedThemeIds) &&
        options.advancedThemeIds.length > 0
        ? new Set(options.advancedThemeIds.map(String))
        : collectFixedAdvancedThemeIds(items)
      : null

  const annotate = (item) => {
    const tid = themeIdOf(item)
    // ① focus 相關分（共用）
    const focusScore = scoreFocusTotal(item, focuses)
    // ② 模式個別
    if (mode === 'fixed') {
      const rank = fixedRecommendRank(item, fixedAdvancedThemes)
      return {
        item,
        focusScore,
        score: focusScore,
        rank,
        themeAlreadyAdvanced: rank === 4,
        themeId: tid,
      }
    }
    // Rolling：程度已進階但有效對話未完 → 最前；已完成有效輪 → 最後
    let rank = 1
    if (isRollingAdvancedRoom(item)) {
      rank = isEffectiveRoundComplete(item) ? 3 : 0
    }
    return {
      item,
      focusScore,
      score: focusScore + scoreRollingBonus(item),
      rank,
      themeAlreadyAdvanced: rank === 3,
      themeId: tid,
    }
  }

  const sortRows = (a, b) => {
    // ③ 先分桶，再比分
    if (a.rank !== b.rank) return a.rank - b.rank
    return b.score - a.score
  }

  // 先只留「跟勾選 focus 有相關」的；都無關才退回全表依模式排序
  const ranked = items
    .map((item) => annotate(item))
    .filter((x) => x.focusScore > 0)
    .sort(sortRows)

  const pool = ranked.length
    ? ranked
    : items.map((item) => annotate(item)).sort(sortRows)

  // 同一主題只取排序最前的一筆
  const picked = []
  const seenThemes = new Set()
  for (const row of pool) {
    const tid = row.themeId || themeIdOf(row.item)
    if (tid && seenThemes.has(tid)) continue
    if (tid) seenThemes.add(tid)
    picked.push(row)
    if (picked.length >= Math.max(0, limit)) break
  }

  return picked.map(({ item }) => {
    const roomMatched = matchedFocusOnItem(item, focuses)
    return {
      id: item.conversationId || item.assistantId,
      assistantId: item.assistantId,
      conversationId: item.conversationId || null,
      conversationTitle: item.conversationTitle || null,
      assistantName: item.assistantName || item.assistantId,
      reason: buildReason(item, focuses, mode, primaryTier),
      matchedFocus: roomMatched.length ? roomMatched : [...focuses],
      practiceFocus: buildPracticeFocus(item, focuses),
      levelTier:
        mode === 'fixed'
          ? displayTier(item.levelKey, item.targetProductTier)
          : cefrToTier(item.levelKey),
      fitStatus: item.fitStatus || null,
      targetProductTier: item.targetProductTier || null,
    }
  })
}

export function isRollingLevelSource(source) {
  const s = (source || '').toLowerCase()
  return s === 'rolling_level' || s === 'm7'
}

export { isFixedLevelSource }
