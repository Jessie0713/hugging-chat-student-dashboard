/** 氛圍恐龍共用緩動 */

export function clamp01(t) {
  return Math.min(1, Math.max(0, t))
}

export function easeInOut(t) {
  const x = clamp01(t)
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2
}

/** 中段略停（甲龍勘查） */
export function easeSurvey(t) {
  const x = clamp01(t)
  if (x < 0.38) return easeInOut(x / 0.38) * 0.42
  if (x < 0.52) return 0.42
  return 0.42 + easeInOut((x - 0.52) / 0.48) * 0.58
}
