/**
 * Dashboard 使用 log（fire-and-forget）
 * 主要追蹤練習建議 → 推薦 → 選聊天室漏斗
 */
import { apiPost } from './api'

const SESSION_KEY = 'hc_dashboard_session_id'

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function getDashboardSessionId() {
  try {
    let id = localStorage.getItem(SESSION_KEY)
    if (!id) {
      id = uuid()
      localStorage.setItem(SESSION_KEY, id)
    }
    return id
  } catch {
    return uuid()
  }
}

/**
 * @param {string} source
 * @param {string} hfUserId
 * @param {string} event
 * @param {object} [payload]
 * @param {{ page?: string, step?: number }} [extra]
 */
export function logDashboardEvent(
  source,
  hfUserId,
  event,
  payload = {},
  extra = {},
) {
  if (!source || !hfUserId || !event) return
  const body = {
    event: String(event),
    sessionId: getDashboardSessionId(),
    page: extra.page || 'practice-next',
    step: extra.step != null ? Number(extra.step) : undefined,
    payload: payload && typeof payload === 'object' ? payload : {},
  }
  apiPost(
    `/api/${source}/student/${encodeURIComponent(hfUserId)}/events`,
    body,
  ).catch(() => {
    /* 不影響 UI */
  })
}
