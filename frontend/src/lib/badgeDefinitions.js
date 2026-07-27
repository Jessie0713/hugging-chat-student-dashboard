/** 獎章定義：優先使用 API（Mongo `badges`），本地為 fallback */

const FIXED_LEVEL_SOURCES = new Set(['fixed_level', 'huggingchat'])

const LEGACY_BADGE_IDS = new Set([
  'streak_3',
  'streak_7',
  'levelup_3',
  'assist_3',
  'msg_100',
  'voice_master',
  'first_message',
  'effective_round',
  'topics_5',
  'topics_6',
  'topics_7',
  'advanced_cert',
])

/** 與 Chat UI LEGACY_BADGE_ID_MAP 對齊 */
const LEGACY_BADGE_ID_MAP = {
  first_message: 'egg_hatch',
  effective_round: 'first_nest',
  topics_5: 'trail_five',
  topics_6: null,
  topics_7: null,
  advanced_cert: null,
}

const QUALIFIED_HINT = '（語音、全英文、內容達標）'

const ICON_FALLBACK = {
  egg_hatch: '🥚',
  first_nest: '🔦',
  flyer_observe: '🪽',
  trail_five: '🐾',
  armor_ready: '🛡️',
  rex_ten: '🦖',
  kaiju_six: '🏯',
}

const GRADE_NOTE_BY_ID = {
  first_nest: '單題有效練習',
  trail_five: '及格線',
  armor_ready: '優秀',
  rex_ten: '課程目標／滿分',
  kaiju_six: '等級要求',
}

function badgeStatValue(def, stats) {
  const s = stats ?? {}
  switch (def.ruleType) {
    case 'total_messages':
      return s.totalMessages ?? 0
    case 'completed_topics':
      return s.completedTopicCount ?? 0
    case 'advanced_topics':
      return s.advancedTopicCount ?? 0
    default:
      return 0
  }
}

function attachProgressHelpers(def) {
  const threshold = Number(def.threshold) || 0
  const unit =
    def.ruleType === 'total_messages'
      ? '則訊息'
      : def.ruleType === 'advanced_topics'
        ? '個進階主題'
        : '個主題'

  return {
    ...def,
    icon: def.icon || ICON_FALLBACK[def.id] || '🏅',
    gradeNote: def.gradeNote ?? GRADE_NOTE_BY_ID[def.id] ?? null,
    progress: (s) => {
      const cur = Math.min(badgeStatValue(def, s), threshold)
      return `${cur}/${threshold}`
    },
    remainingText: (s) => {
      const left = Math.max(0, threshold - badgeStatValue(def, s))
      return left === 0 ? '已達成' : `還差 ${left} ${unit}`
    },
  }
}

/** 本地 fallback（Mongo badges 空時） */
const ACHIEVEMENT_BADGES = [
  {
    id: 'egg_hatch',
    iconUrl: '/dinosaurs/dino-egg.png',
    name: '破殼而出',
    meaning: '你踏出練習第一步，恐龍蛋破殼了。',
    unlock: '第一次送出訊息（打字或語音皆可）',
    threshold: 1,
    ruleType: 'total_messages',
    sortOrder: 1,
  },
  {
    id: 'first_nest',
    iconUrl: '/dinosaurs/dino-explore.png',
    name: '初探巢穴',
    meaning: '你在一個主題完成有效口說練習。',
    unlock: `1 個不同主題各完成有效一輪${QUALIFIED_HINT}`,
    threshold: 1,
    ruleType: 'completed_topics',
    sortOrder: 2,
  },
  {
    id: 'flyer_observe',
    iconUrl: '/dinosaurs/dino-flyer.png',
    name: '翼手龍觀察',
    meaning: '你開始觀察自己的練習足跡，涵蓋更多主題。',
    unlock: `3 個不同主題各完成有效一輪${QUALIFIED_HINT}`,
    threshold: 3,
    ruleType: 'completed_topics',
    sortOrder: 3,
  },
  {
    id: 'trail_five',
    iconUrl: '/dinosaurs/dino-trail.png',
    name: '足跡擴張',
    meaning: '你的練習足跡持續擴大。',
    unlock: `5 個不同主題各完成有效一輪${QUALIFIED_HINT}`,
    threshold: 5,
    ruleType: 'completed_topics',
    sortOrder: 4,
  },
  {
    id: 'armor_ready',
    iconUrl: '/dinosaurs/dino-armor.png',
    name: '甲龍就緒',
    meaning: '你已累積足夠練習，準備好策劃下一步。',
    unlock: `8 個不同主題各完成有效一輪${QUALIFIED_HINT}`,
    threshold: 8,
    ruleType: 'completed_topics',
    sortOrder: 5,
  },
  {
    id: 'rex_ten',
    iconUrl: '/dinosaurs/dino-rex.png',
    name: '十棲地王者',
    meaning: '你完成課程目標：在 10 個聊天室達成有效練習。',
    unlock: `10 個不同主題各完成有效一輪${QUALIFIED_HINT}`,
    threshold: 10,
    ruleType: 'completed_topics',
    sortOrder: 6,
  },
  {
    id: 'kaiju_six',
    iconUrl: '/dinosaurs/dino-kaiju-happy.png',
    name: '進階守護龍',
    meaning: '你在多個主題達到進階（或以上），自我調節再升級。',
    unlock: '6 個主題已完成有效一輪且練習等級為進階或以上',
    threshold: 6,
    ruleType: 'advanced_topics',
    sortOrder: 7,
  },
].map(attachProgressHelpers)

export function isFixedLevelSource(source) {
  return FIXED_LEVEL_SOURCES.has((source || '').toLowerCase())
}

/** 將 API `badgeDefinitions` 轉成前端可用定義；空則 fallback */
export function hydrateBadgeDefinitions(apiDefs) {
  if (Array.isArray(apiDefs) && apiDefs.length > 0) {
    return apiDefs
      .filter((d) => d && typeof d.id === 'string')
      .map((d) =>
        attachProgressHelpers({
          id: d.id,
          name: d.name,
          meaning: d.meaning,
          unlock: d.unlock,
          iconUrl: d.iconUrl,
          ruleType: d.ruleType,
          threshold: d.threshold,
          sortOrder: d.sortOrder,
          phase: d.phase,
        }),
      )
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  }
  return ACHIEVEMENT_BADGES
}

function remapLegacyBadgeIds(ids) {
  const out = new Set()
  for (const id of Array.isArray(ids) ? ids : []) {
    if (Object.prototype.hasOwnProperty.call(LEGACY_BADGE_ID_MAP, id)) {
      const mapped = LEGACY_BADGE_ID_MAP[id]
      if (mapped) out.add(mapped)
      continue
    }
    if (LEGACY_BADGE_IDS.has(id)) continue
    out.add(id)
  }
  return [...out]
}

/** 只計現行獎章（可傳入 API 定義 id 集合） */
export function filterActiveEarnedIds(earnedIds, apiDefs) {
  const defs = hydrateBadgeDefinitions(apiDefs)
  const active = new Set(defs.map((b) => b.id))
  const remapped = remapLegacyBadgeIds(earnedIds)
  return remapped.filter((id) => active.has(id))
}

export function hasLegacyEarnedIds(earnedIds) {
  return (Array.isArray(earnedIds) ? earnedIds : []).some(
    (id) => LEGACY_BADGE_IDS.has(id) || id in LEGACY_BADGE_ID_MAP,
  )
}
