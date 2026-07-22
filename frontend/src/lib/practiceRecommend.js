import {
  cefrToTier,
  classifyPracticeFit,
  displayTier,
  TIER_ORDER,
} from './levelDisplay'
import { isFixedLevelSource } from './badgeDefinitions'

/** 與 Chat UI 評估 advice.focus 對齊 */
export const FOCUS_TAGS = [
  '描述需求',
  '修正表達',
  '情境對話',
  '回應技巧',
  '敘事清晰度',
  '詞彙選擇',
]

const FOCUS_META = {
  描述需求: {
    keywords: ['描述', '需求', '完整句', '形容詞', '點餐', '細節'],
    practiceTip: '練習用完整句子描述需求，並加入具體細節。',
  },
  修正表達: {
    keywords: ['修正', '表達', '完整', '句子', '文法', '結構'],
    practiceTip: '注意句子結構完整，避免語句中斷或片語式回答。',
  },
  情境對話: {
    keywords: ['情境', '對話', '互動', '場景', '銜接'],
    practiceTip: '在情境中練習自然接話，讓回答與對話流程連貫。',
  },
  回應技巧: {
    keywords: ['回應', '互動', '輪次', '接話', '反應'],
    practiceTip: '練習針對問題給出清楚、相關的回應。',
  },
  敘事清晰度: {
    keywords: ['敘事', '清楚', '因果', 'because', '解釋', '流程'],
    practiceTip: '嘗試使用 because、so 或 when，讓說明更清楚。',
  },
  詞彙選擇: {
    keywords: ['詞彙', '用字', '形容詞', '具體', '豐富'],
    practiceTip: '在回答中加入更精準或具體的詞彙。',
  },
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

/** @deprecated 請用 getRubricConditionsForTier */
export function getAdvancedRubricConditions() {
  return getRubricConditionsForTier('進階')
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
  const meta = FOCUS_META[focusTag]
  if (!text || !meta) return false
  const lower = String(text).toLowerCase()
  return meta.keywords.some(
    (kw) => lower.includes(kw.toLowerCase()) || text.includes(kw),
  )
}

export function aggregateWeaknesses(items = []) {
  const counts = new Map()
  for (const tag of collectFocusList(items)) {
    counts.set(tag, (counts.get(tag) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count }))
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
/** @deprecated 請用 SRL_GOAL_TIER */
export const FIXED_SRL_GOAL_TIER = SRL_GOAL_TIER
/** @deprecated 請用 SRL_GOAL_ROOMS */
export const FIXED_SRL_GOAL_ROOMS = SRL_GOAL_ROOMS

function normalizeFitKey(fitStatus) {
  return String(fitStatus || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
}

export function isAdvancedInBandRoom(item) {
  const tier = String(item?.targetProductTier || '').trim()
  return tier === SRL_GOAL_TIER && normalizeFitKey(item?.fitStatus) === 'in_band'
}

/** rolling：評估大階已達進階（含高階） */
export function isRollingAdvancedRoom(item) {
  const tier = cefrToTier(item?.levelKey)
  return TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(SRL_GOAL_TIER)
}

/**
 * fixed：選定進階且 in_band（後端 advancedFitProgress 為準；此為 fallback）
 */
export function summarizeAdvancedFitProgress(
  items = [],
  goal = SRL_GOAL_ROOMS,
) {
  const ids = new Set()
  for (const item of items) {
    if (!isAdvancedInBandRoom(item)) continue
    const id = item.conversationId || item.assistantId
    if (id) ids.add(String(id))
  }
  const count = ids.size
  return {
    tier: SRL_GOAL_TIER,
    count,
    goal,
    met: count >= goal,
    mode: 'fixed',
  }
}

/**
 * rolling：聊天室（assistant）等級已達進階／高階
 */
export function summarizeRollingAdvancedProgress(
  items = [],
  goal = SRL_GOAL_ROOMS,
) {
  const ids = new Set()
  for (const item of items) {
    if (!isRollingAdvancedRoom(item)) continue
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

function scoreItem(item, selectedFocus, mode) {
  const advice = item.advice || {}
  const focus = Array.isArray(advice.focus) ? advice.focus : []
  const nextTask = advice.nextTask || ''
  const desc = item.assistantDescription || ''
  const name = item.assistantName || ''

  let score = 0
  if (focus.includes(selectedFocus)) score += 5
  if (textMatchesFocus(nextTask, selectedFocus)) score += 3
  if (textMatchesFocus(desc, selectedFocus)) score += 2
  if (textMatchesFocus(name, selectedFocus)) score += 1

  if (mode === 'fixed') {
    // 課程目標：選定進階；尚未符合進階的優先
    const fit = String(item.fitStatus || '')
      .toLowerCase()
      .replace(/-/g, '_')
    const target = String(item.targetProductTier || '').trim()
    if (target === '進階') score += 3
    if (fit === 'below' || fit === 'too_hard') score += 8
    else if (target === '進階' && fit !== 'in_band') score += 4
    else if (classifyPracticeFit(item.fitStatus) === 'unmatched') score += 2
  } else {
    // 課程目標：尚未到達進階的聊天室優先
    const tier = cefrToTier(item.levelKey)
    const next = cefrToTier(item.nextLevelKey)
    const ti = TIER_ORDER.indexOf(tier)
    const goalIdx = TIER_ORDER.indexOf('進階')
    if (ti >= 0 && ti < goalIdx) score += 6
    if (tier !== '未知' && next !== '未知' && tier !== next) score += 1
    if (typeof item.confidence === 'number' && item.confidence < 0.85) {
      score += 0.5
    }
  }

  return score
}

function matchedFocusOnItem(item, selectedFocusList) {
  const adviceFocus = item.advice?.focus || []
  return selectedFocusList.filter((f) => adviceFocus.includes(f))
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
    const tier = item.targetProductTier || primaryTier
    const fit = String(item.fitStatus || '')
      .toLowerCase()
      .replace(/-/g, '_')

    if (fit === 'too_hard') {
      return matched.length
        ? `想先把「${hit}」練穩的話，回「${where}」最合適：上次偏難，適合放慢、講清楚，比較容易符合「${tier}」。`
        : `想先把「${chosen}」練穩的話，回「${where}」：上次偏難，適合放慢練習，比較容易符合「${tier}」。`
    }
    if (fit === 'too_easy') {
      return matched.length
        ? `想在「${tier}」裡說得更完整，可回「${where}」加深「${hit}」：上次偏易，正好挑戰多一點。`
        : `想在「${tier}」裡說得更完整，可回「${where}」練「${chosen}」：上次偏易，正好挑戰多一點。`
    }
    if (fit === 'in_band' || classifyPracticeFit(item.fitStatus) === 'matched') {
      return matched.length
        ? `已經符合「${tier}」了；回「${where}」再練「${hit}」，可以說得更穩、更自然。`
        : `已經符合「${tier}」了；回「${where}」用「${chosen}」再熟練一次，會更有把握。`
    }
    return matched.length
      ? `「${where}」剛好對上你想練的「${hit}」，有助於更符合「${tier}」。`
      : `「${where}」適合練你勾的「${chosen}」，有助於更符合「${tier}」。`
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

/** fixed：評估結果低於該次選定等級（below / too_hard，或大階低於 target） */
function isBelowSelectedLevel(item, primaryTier) {
  const fit = String(item.fitStatus || '')
    .toLowerCase()
    .replace(/-/g, '_')
  if (fit === 'below' || fit === 'too_hard') return true

  const assessed = cefrToTier(item.levelKey)
  const selected = item.targetProductTier || primaryTier
  if (assessed === '未知' || tierIndex(selected) < 0) return false
  return tierIndex(assessed) < tierIndex(selected)
}

/**
 * @param {object[]} items 正規化後的聊天室／對話列表
 * @param {string[]} selectedFocusList
 * @param {{ mode?: 'rolling'|'fixed', primaryTier?: string, limit?: number }} options
 *   預設最多推薦 2 個；fixed 會優先「低於選定等級」
 */
export function recommendAssistants(items = [], selectedFocusList = [], options = {}) {
  const focuses = (Array.isArray(selectedFocusList) ? selectedFocusList : [])
    .map((f) => String(f).trim())
    .filter(Boolean)
  const mode = options.mode === 'fixed' ? 'fixed' : 'rolling'
  const primaryTier = options.primaryTier || '基礎'
  const limit = options.limit != null ? options.limit : 2

  if (!focuses.length || !items.length) return []

  const ranked = items
    .map((item) => ({
      item,
      score: focuses.reduce((sum, f) => sum + scoreItem(item, f, mode), 0),
      // 尚未達課程目標（進階）的排前面
      needAdvance:
        mode === 'fixed'
          ? isBelowSelectedLevel(item, primaryTier)
          : !isRollingAdvancedRoom(item),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => {
      if (a.needAdvance !== b.needAdvance) {
        return a.needAdvance ? -1 : 1
      }
      return b.score - a.score
    })

  const pool = ranked.length
    ? ranked
    : items
        .map((item) => ({
          item,
          score: 0,
          needAdvance:
            mode === 'fixed'
              ? isBelowSelectedLevel(item, primaryTier)
              : !isRollingAdvancedRoom(item),
        }))
        .sort((a, b) => {
          if (a.needAdvance !== b.needAdvance) {
            return a.needAdvance ? -1 : 1
          }
          return 0
        })

  return pool.slice(0, Math.max(0, limit)).map(({ item }) => {
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
