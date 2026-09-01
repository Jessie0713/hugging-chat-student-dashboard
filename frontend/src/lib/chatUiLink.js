import { getDashboardSessionId } from './dashboardLog'

const DEFAULT_CHAT_UI_ORIGIN = 'http://localhost:5175'

export function getChatUiOrigin() {
  const raw = import.meta.env.VITE_CHAT_UI_ORIGIN
  return (raw || DEFAULT_CHAT_UI_ORIGIN).replace(/\/$/, '')
}

/**
 * 組 Chat UI 練習 deep link（Dashboard pick → 開啟對話）
 * @param {{ modelId?: string, conversationId?: string, pickId?: string, source?: string, hfUserId?: string }} params
 */
export function buildChatUiPracticeUrl({
  modelId,
  conversationId,
  pickId,
  source,
  hfUserId,
}) {
  const model = (modelId || '').trim()
  const conv = (conversationId || '').trim()
  if (!model || !conv) return null

  const params = new URLSearchParams({
    from: 'dashboard',
    pickId: pickId || '',
    source: source || '',
    hfUserId: hfUserId || '',
    dashboardSessionId: getDashboardSessionId(),
  })

  return `${getChatUiOrigin()}/chat/${encodeURIComponent(model)}/conversation/${encodeURIComponent(conv)}?${params.toString()}`
}

export function generatePickId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `pick-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
