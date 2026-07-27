/** 恐龍飛過內容區時自動變淡，讓儀表板仍清楚可讀 */

export const AMBIENT_OPACITY_CLEAR = 0.78
export const AMBIENT_OPACITY_GHOST = 0.16

const SELECTOR =
  '[data-ambient-block], .MuiCard-root, .MuiPaper-root, .MuiAppBar-root'

let cachedRects = []
let cacheAt = 0
const CACHE_MS = 280

export function invalidateAmbientContentCache() {
  cacheAt = 0
  cachedRects = []
}

export function collectContentRects(force = false) {
  const now = performance.now()
  if (!force && cachedRects.length && now - cacheAt < CACHE_MS) {
    return cachedRects
  }

  const root = document.querySelector('[data-student-shell]')
  const header = document.querySelector('[data-student-header]')
  const scopes = [root, header].filter(Boolean)
  if (!scopes.length) {
    cachedRects = []
    cacheAt = now
    return cachedRects
  }

  const rects = []
  const seen = new Set()
  for (const scope of scopes) {
    const nodes = scope.querySelectorAll(SELECTOR)
    for (const el of nodes) {
      if (seen.has(el)) continue
      seen.add(el)
      const r = el.getBoundingClientRect()
      if (r.width < 48 || r.height < 36) continue
      const pad = 4
      rects.push({
        left: r.left + pad,
        top: r.top + pad,
        right: r.right - pad,
        bottom: r.bottom - pad,
        width: Math.max(0, r.width - pad * 2),
        height: Math.max(0, r.height - pad * 2),
      })
    }
    // header 整塊也當障礙
    if (scope === header) {
      const r = scope.getBoundingClientRect()
      if (r.height > 20) {
        rects.push({
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        })
      }
    }
  }
  cachedRects = rects
  cacheAt = now
  return cachedRects
}

function overlapRatio(dino, content) {
  const ix = Math.max(
    0,
    Math.min(dino.right, content.right) - Math.max(dino.left, content.left),
  )
  const iy = Math.max(
    0,
    Math.min(dino.bottom, content.bottom) - Math.max(dino.top, content.top),
  )
  const area = ix * iy
  if (area <= 0) return 0
  const dinoArea = Math.max(1, dino.width * dino.height)
  return area / dinoArea
}

/**
 * @param {{ left:number, top:number, width:number, height:number }} dinoRect
 * @param {{ clear?: number, ghost?: number }} [opts]
 * @returns {number} opacity
 */
export function opacityOverContent(dinoRect, opts = {}) {
  const clear = opts.clear ?? AMBIENT_OPACITY_CLEAR
  const ghost = opts.ghost ?? AMBIENT_OPACITY_GHOST
  const rects = collectContentRects()
  if (!rects.length || !dinoRect?.width) return clear

  const dino = {
    left: dinoRect.left,
    top: dinoRect.top,
    right: dinoRect.left + dinoRect.width,
    bottom: dinoRect.top + dinoRect.height,
    width: dinoRect.width,
    height: dinoRect.height,
  }

  let maxOverlap = 0
  for (const c of rects) {
    maxOverlap = Math.max(maxOverlap, overlapRatio(dino, c))
    if (maxOverlap > 0.85) break
  }

  // 重疊越多越淡；小幅重疊就開始淡
  const t = Math.min(1, maxOverlap * 1.55)
  return clear + (ghost - clear) * t
}

/** 由 transform 座標推估螢幕上的 AABB（地面恐龍：bottom + translate） */
export function groundDinoScreenRect({ x, y, size, baseBottom, aspect = 0.85 }) {
  const h = size * aspect
  const bottomPx = window.innerHeight * (baseBottom ?? 0.08)
  // translateY 正值往下；我們的 bob 負值往上
  const bottom = window.innerHeight - bottomPx + y
  const top = bottom - h
  return { left: x, top, width: size, height: h }
}

/** 翼手龍：top-left + translate */
export function flyerDinoScreenRect({ x, y, size, aspect = 0.7 }) {
  const h = size * aspect
  return { left: x, top: y, width: size, height: h }
}
