/** 與 Chat UI src/lib/badge/definitions.ts 對齊 */

const FIXED_LEVEL_SOURCES = new Set(['fixed_level', 'huggingchat'])

export const LEGACY_BADGE_IDS = new Set([
  'streak_3',
  'streak_7',
  'levelup_3',
  'assist_3',
  'msg_100',
  'voice_master',
])

/** rolling_level / fixed_level / Chat UI — 現行 6 枚（對齊成績計算） */
export const ACHIEVEMENT_BADGES = [
  {
    id: 'first_message',
    icon: '🌟',
    name: '初次發言',
    meaning: '你已踏出口說練習的第一步。',
    unlock: '第一次送出訊息（打字或語音皆可）',
    gradeNote: null,
    progress: (s) => `${Math.min(s?.totalMessages ?? 0, 1)}/1`,
    remainingText: (s) =>
      (s?.totalMessages ?? 0) >= 1 ? '已達成' : '還差 1 則訊息',
  },
  {
    id: 'effective_round',
    icon: '✅',
    name: '有效一輪',
    meaning: '你在單一情境完成 8 次合格語音回應的有效練習。',
    unlock: '單一 assistant 累積 8 次合格回應',
    gradeNote: '單題有效練習',
    progress: (s) => `${Math.min(s?.maxEffectiveCount ?? 0, 8)}/8`,
    remainingText: (s) => {
      const left = Math.max(0, 8 - (s?.maxEffectiveCount ?? 0))
      return left === 0 ? '已達成' : `單題還差 ${left} 次合格回應`
    },
  },
  {
    id: 'topics_5',
    icon: '🥉',
    name: '及格線',
    meaning: '你已在 5 個主題各完成有效一輪，達到口說成績及格線。',
    unlock: '5 個不同 assistant 各完成有效一輪',
    gradeNote: '65 分',
    progress: (s) => `${Math.min(s?.completedTopicCount ?? 0, 5)}/5`,
    remainingText: (s) => {
      const left = Math.max(0, 5 - (s?.completedTopicCount ?? 0))
      return left === 0 ? '已達成' : `還差 ${left} 個主題`
    },
  },
  {
    id: 'topics_6',
    icon: '🥈',
    name: '優秀',
    meaning: '你已在 6 個主題各完成有效一輪，表現優秀。',
    unlock: '6 個主題各完成有效一輪',
    gradeNote: '85 分',
    progress: (s) => `${Math.min(s?.completedTopicCount ?? 0, 6)}/6`,
    remainingText: (s) => {
      const left = Math.max(0, 6 - (s?.completedTopicCount ?? 0))
      return left === 0 ? '已達成' : `還差 ${left} 個主題`
    },
  },
  {
    id: 'topics_7',
    icon: '🥇',
    name: '滿分',
    meaning: '你已在 7 個主題各完成有效一輪，達到滿分標準。',
    unlock: '7 個主題各完成有效一輪',
    gradeNote: '100 分',
    progress: (s) => `${Math.min(s?.completedTopicCount ?? 0, 7)}/7`,
    remainingText: (s) => {
      const left = Math.max(0, 7 - (s?.completedTopicCount ?? 0))
      return left === 0 ? '已達成' : `還差 ${left} 個主題`
    },
  },
  {
    id: 'advanced_cert',
    icon: '📈',
    name: '進階達標',
    meaning: '你已在 4 個主題完成有效一輪，且練習等級達進階。',
    unlock: '4 個主題已完成有效一輪且練習等級為進階（B1/B2）',
    gradeNote: '等級要求',
    progress: (s) => `${Math.min(s?.advancedTopicCount ?? 0, 4)}/4`,
    remainingText: (s) => {
      const left = Math.max(0, 4 - (s?.advancedTopicCount ?? 0))
      return left === 0 ? '已達成' : `還差 ${left} 個進階主題`
    },
  },
]

export function isFixedLevelSource(source) {
  return FIXED_LEVEL_SOURCES.has((source || '').toLowerCase())
}

export function getBadgesForSource(_source) {
  return ACHIEVEMENT_BADGES
}

/** 只計現行獎章，忽略 legacy earnedIds */
export function filterActiveEarnedIds(earnedIds) {
  const active = new Set(ACHIEVEMENT_BADGES.map((b) => b.id))
  return (Array.isArray(earnedIds) ? earnedIds : []).filter((id) =>
    active.has(id),
  )
}

export function hasLegacyEarnedIds(earnedIds) {
  return (Array.isArray(earnedIds) ? earnedIds : []).some((id) =>
    LEGACY_BADGE_IDS.has(id),
  )
}
