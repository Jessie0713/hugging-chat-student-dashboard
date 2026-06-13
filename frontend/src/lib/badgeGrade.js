/** 口說成績預估 — 與 Chat UI 獎章／成績檔位對齊 */

export function estimateOralGrade(stats = {}, earnedIds = []) {
  const earned = new Set(Array.isArray(earnedIds) ? earnedIds : [])
  const completed = stats.completedTopicCount ?? 0
  const advanced = stats.advancedTopicCount ?? 0

  let score = null
  let scoreLabel = '尚未達標'
  let badgeId = null

  if (earned.has('topics_7') || completed >= 7) {
    score = 100
    scoreLabel = '滿分'
    badgeId = 'topics_7'
  } else if (earned.has('topics_6') || completed >= 6) {
    score = 85
    scoreLabel = '優秀'
    badgeId = 'topics_6'
  } else if (earned.has('topics_5') || completed >= 5) {
    score = 65
    scoreLabel = '及格線'
    badgeId = 'topics_5'
  }

  const levelRequirementMet =
    earned.has('advanced_cert') || advanced >= 4

  return {
    score,
    scoreLabel,
    badgeId,
    completedTopicCount: completed,
    advancedTopicCount: advanced,
    levelRequirementMet,
  }
}
