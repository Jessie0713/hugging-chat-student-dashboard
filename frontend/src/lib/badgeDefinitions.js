/** 獎章定義：優先使用 API（Mongo `badges`），本地為 fallback（新制成績） */

const FIXED_LEVEL_SOURCES = new Set(['fixed_level', 'huggingchat'])

/** 解鎖氛圍恐龍／App bar 的獎章 id */
export const BADGE_UNLOCK = {
  flyer: 'milestone_topics_2',
  armor: 'milestone_topics_6',
  rex: 'milestone_topics_8',
  kaiju: 'kaiju_guardian',
}

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
  'first_nest',
  'flyer_observe',
  'trail_five',
  'armor_ready',
  'rex_ten',
  'kaiju_six',
])

/** 與 Chat UI LEGACY_BADGE_ID_MAP 對齊 */
const LEGACY_BADGE_ID_MAP = {
  first_message: 'egg_hatch',
  effective_round: 'milestone_topics_2',
  topics_5: 'milestone_topics_2',
  topics_6: 'milestone_topics_4',
  topics_7: 'milestone_topics_6',
  advanced_cert: 'kaiju_guardian',
}

const QUALIFIED_HINT = '（語音、全英文、內容達標）'

const ICON_FALLBACK = {
  egg_hatch: '🥚',
  milestone_topics_2: '🐾',
  milestone_topics_4: '🪽',
  milestone_topics_6: '🛡️',
  milestone_topics_8: '🦖',
  kaiju_guardian: '🏯',
  srl_reflect: '🔭',
}

const GRADE_NOTE_BY_ID = {
  egg_hatch: '0 分',
  milestone_topics_2: '累計 30 分',
  milestone_topics_4: '累計 50 分',
  milestone_topics_6: '累計 60 分',
  milestone_topics_8: '累計 80 分',
  kaiju_guardian: '守護神獸 20 分',
  srl_reflect: '額外加成來源',
}

function dashboardUsageCount(stats) {
  const s = stats ?? {}
  return s.dashboardUsageCount ?? s.dashboardViewCount ?? 0
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
    case 'advanced_second_rating':
      return s.secondAdvancedCount ?? 0
    case 'dashboard_views':
      return dashboardUsageCount(s)
    case 'milestone_dual':
      return s.completedTopicCount ?? 0
    default:
      return 0
  }
}

function milestoneDualProgress(def, stats) {
  const s = stats ?? {}
  const needTopics = Number(def.threshold) || 0
  const needViews = Number(def.meta?.views) || 0
  const topics = s.completedTopicCount ?? 0
  const usage = dashboardUsageCount(s)
  const topicsOk = topics >= needTopics
  const usageOk = usage >= needViews
  if (topicsOk && usageOk) {
    return `${needTopics}/${needTopics} 主題 · ${needViews}/${needViews} 完成練習`
  }
  return `${Math.min(topics, needTopics)}/${needTopics} 主題 · ${Math.min(usage, needViews)}/${needViews} 完成練習`
}

function milestoneDualRemaining(def, stats) {
  const s = stats ?? {}
  const needTopics = Number(def.threshold) || 0
  const needViews = Number(def.meta?.views) || 0
  const topics = s.completedTopicCount ?? 0
  const usage = dashboardUsageCount(s)
  if (topics >= needTopics && usage >= needViews) return '已達成'
  const parts = []
  if (topics < needTopics) {
    parts.push(`還差 ${needTopics - topics} 主題有效一輪`)
  }
  if (usage < needViews) {
    parts.push(`還差 ${needViews - usage} 次依練習建議完成練習`)
  }
  return parts.join(' · ')
}

function attachProgressHelpers(def) {
  const threshold = Number(def.threshold) || 0
  const unit =
    def.ruleType === 'total_messages'
      ? '則訊息'
      : def.ruleType === 'dashboard_views'
        ? '次完成練習'
        : def.ruleType === 'advanced_second_rating'
          ? '題第二次評級達進階'
          : def.ruleType === 'milestone_dual'
            ? '主題'
            : def.ruleType === 'advanced_topics'
              ? '個進階主題'
              : '個主題'

  return {
    ...def,
    meta: def.meta ?? {},
    icon: def.icon || ICON_FALLBACK[def.id] || '🏅',
    gradeNote: def.gradeNote ?? GRADE_NOTE_BY_ID[def.id] ?? null,
    progress: (s) => {
      if (def.ruleType === 'milestone_dual') {
        return milestoneDualProgress(def, s)
      }
      const cur = Math.min(badgeStatValue(def, s), threshold)
      return `${cur}/${threshold}`
    },
    remainingText: (s) => {
      if (def.ruleType === 'milestone_dual') {
        return milestoneDualRemaining(def, s)
      }
      const left = Math.max(0, threshold - badgeStatValue(def, s))
      return left === 0 ? '已達成' : `還差 ${left} ${unit}`
    },
  }
}

/** 本地 fallback（Mongo badges 空或仍為舊制時） */
const ACHIEVEMENT_BADGES = [
  {
    id: 'egg_hatch',
    iconUrl: '/dinosaurs/dino-egg.png',
    name: '破殼而出',
    meaning: '蛋裂聲起——你送出了第一聲開口，恐龍探險正式啟程。',
    unlock: '第一次送出訊息（打字或語音皆可）',
    threshold: 1,
    ruleType: 'total_messages',
    sortOrder: 1,
  },
  {
    id: 'milestone_topics_2',
    iconUrl: '/dinosaurs/dino-trail.png',
    name: '足跡初現',
    meaning: '探險小徑上留下第一批腳印，你也開始回營地查看地圖。',
    unlock: `2 個主題有效一輪${QUALIFIED_HINT} + 依練習建議完成練習 2 次`,
    threshold: 2,
    ruleType: 'milestone_dual',
    meta: { views: 2, baseScore: 30 },
    sortOrder: 2,
  },
  {
    id: 'milestone_topics_4',
    iconUrl: '/dinosaurs/dino-flyer.png',
    name: '翼手龍觀察',
    meaning: '翼手龍帶你從高處俯瞰練習足跡，學會觀察再出發。',
    unlock: `4 個主題有效一輪${QUALIFIED_HINT} + 依練習建議完成練習 3 次`,
    threshold: 4,
    ruleType: 'milestone_dual',
    meta: { views: 3, baseScore: 50 },
    sortOrder: 3,
  },
  {
    id: 'milestone_topics_6',
    iconUrl: '/dinosaurs/dino-armor.png',
    name: '甲龍就緒',
    meaning: '厚甲護身、策略在握——六片棲地都已有效練習。',
    unlock: `6 個主題有效一輪${QUALIFIED_HINT} + 依練習建議完成練習 4 次`,
    threshold: 6,
    ruleType: 'milestone_dual',
    meta: { views: 4, baseScore: 60 },
    sortOrder: 4,
  },
  {
    id: 'milestone_topics_8',
    iconUrl: '/dinosaurs/dino-rex.png',
    name: '棲地王者',
    meaning: '八片棲地盡收腳下，你是這趟口說探險的王者。',
    unlock: `8 個主題有效一輪${QUALIFIED_HINT} + 依練習建議完成練習 5 次`,
    threshold: 8,
    ruleType: 'milestone_dual',
    meta: { views: 5, baseScore: 80 },
    sortOrder: 5,
  },
  {
    id: 'kaiju_guardian',
    iconUrl: '/dinosaurs/dino-kaiju-happy.png',
    name: '守護神獸',
    meaning: '五題二次評級達進階，神獸現身為你的進步守關。',
    unlock: '5 個主題第二次評級達進階（或以上），每題 4 分共 20 分',
    threshold: 5,
    ruleType: 'advanced_second_rating',
    sortOrder: 6,
  },
  {
    id: 'srl_reflect',
    iconUrl: '/dinosaurs/dino-explore.png',
    name: '回望探險家',
    meaning: '你會定期回到營地檢視地圖，第 6 次查看起可獲額外加成。',
    unlock: '依練習建議完成練習 5 次（第 6 次起每次 +2 分額外加成）',
    threshold: 5,
    ruleType: 'dashboard_views',
    sortOrder: 7,
  },
].map(attachProgressHelpers)

export function isFixedLevelSource(source) {
  return FIXED_LEVEL_SOURCES.has((source || '').toLowerCase())
}

/** 將 API `badgeDefinitions` 轉成前端可用定義；空則 fallback */
export function hydrateBadgeDefinitions(apiDefs) {
  if (Array.isArray(apiDefs) && apiDefs.length > 0) {
    const ids = new Set(apiDefs.map((d) => d?.id).filter(Boolean))
    const useNew = ids.has('milestone_topics_2') || ids.has('milestone_topics_8')
    const source = useNew ? apiDefs : ACHIEVEMENT_BADGES
    return source
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
          meta: d.meta,
          gradeNote: d.gradeNote,
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
