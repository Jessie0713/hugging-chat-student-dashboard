/** 後端 CEFR levelKey → 前端顯示大階（rubric 仍用 CEFR，僅 UI 對照） */
import { colors } from '../theme/tokens'

const CEFR_TO_TIER = {
  PreA1: '入門',
  A1: '基礎',
  A2: '基礎',
  B1: '進階',
  B2: '進階',
  C1: '高階',
  C2: '高階',
  C1C2: '高階',
}

export const TIER_ORDER = ['入門', '基礎', '進階', '高階']

/** 等級分佈等：色相拉開方便辨識（沙／天空藍調／葉綠／琥珀） */
export const TIER_COLORS = {
  入門: '#d6c4a8',
  基礎: '#6a9bb0',
  進階: '#6f8f5e',
  高階: '#b07a45',
}

const VALID_TIERS = new Set(TIER_ORDER)

export function cefrToTier(levelKey) {
  if (!levelKey) return '未知'
  return CEFR_TO_TIER[levelKey] ?? '未知'
}

/** 顯示用大階：優先 targetProductTier，否則從 levelKey 對照 */
export function displayTier(levelKey, targetProductTier) {
  if (targetProductTier && VALID_TIERS.has(targetProductTier)) {
    return targetProductTier
  }
  return cefrToTier(levelKey)
}

/** 下一階 Chip：同大階 →「基礎再熟練」；跨大階 →「基礎」 */
export function formatNextLevelLabel(currentKey, nextKey) {
  if (!nextKey) return ''
  const currentTier = cefrToTier(currentKey)
  const nextTier = cefrToTier(nextKey)
  if (currentTier === nextTier) {
    return `${nextTier}再熟練`
  }
  return nextTier
}

/** 符合 / 不符合共用色（圓餅圖、折線圖、Chip 一致）— 主色系 */
export const FIT_PIE_COLORS = {
  符合等級: colors.leaf,
  不符合等級: colors.amber,
}

export const FIT_MATCH_COLOR = FIT_PIE_COLORS['符合等級']
export const FIT_UNMATCH_COLOR = FIT_PIE_COLORS['不符合等級']

export const FIT_STATUS_LABELS = {
  in_band: '符合所選等級',
  too_hard: '偏難',
  too_easy: '偏易',
  below: '低於選定等級',
  above: '高於選定等級',
}

export const FIT_STATUS_COLORS = {
  in_band: 'success',
  too_hard: 'warning',
  too_easy: 'info',
}

function normalizeFitStatus(fitStatus) {
  if (fitStatus == null || fitStatus === '') return null
  return String(fitStatus).trim().toLowerCase().replace(/-/g, '_')
}

export function formatFitStatus(fitStatus) {
  const key = normalizeFitStatus(fitStatus)
  if (key && FIT_STATUS_LABELS[key]) return FIT_STATUS_LABELS[key]
  return fitStatus ?? '未知'
}

/** Chip 樣式：與圓餅圖同色 */
export function getFitStatusChipProps(fitStatus) {
  const matched = classifyPracticeFit(fitStatus) === 'matched'
  return {
    sx: {
      bgcolor: matched ? FIT_MATCH_COLOR : FIT_UNMATCH_COLOR,
      color: '#fff',
      fontWeight: 600,
    },
  }
}

/** 圓餅圖 / 列表篩選：in_band + too_easy → matched，其餘 → unmatched */
export function classifyPracticeFit(fitStatus) {
  const s = normalizeFitStatus(fitStatus)
  if (s === 'in_band' || s === 'too_easy') return 'matched'
  return 'unmatched'
}

/** tierSummary → 圓餅圖資料 */
export function tierSummaryToPieData(tierSummary = {}) {
  return TIER_ORDER.filter((t) => (tierSummary[t] || 0) > 0).map((t, idx) => ({
    id: idx,
    value: tierSummary[t],
    label: t,
  }))
}

/** 將後端 cefrGroups（依 CEFR 分組）合併為四大階 */
export function groupCefrByTier(cefrGroups = []) {
  const map = new Map()
  for (const g of cefrGroups) {
    const tier = cefrToTier(g.levelKey)
    if (!map.has(tier)) {
      map.set(tier, { tier, assistants: [] })
    }
    map.get(tier).assistants.push(...(g.assistants || []))
  }
  return TIER_ORDER.filter((t) => map.has(t)).map((t) => ({
    tier: t,
    title: t,
    assistants: map.get(t).assistants,
  }))
}
