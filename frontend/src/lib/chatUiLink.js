import { getDashboardSessionId } from './dashboardLog'

const DEFAULT_CHAT_UI_ORIGIN = 'http://localhost:5175'

function normalizeOrigin(url) {
  return (url || '').trim().replace(/\/$/, '')
}

function envOrigin(key) {
  const raw = import.meta.env[key]
  return normalizeOrigin(raw) || null
}

/**
 * 依 source 選 Chat UI 網址（Vite env，見專案根目錄 .env）
 *
 * VITE_CHAT_UI_ORIGIN                 — 預設（兩邊都沒設時 fallback）
 * VITE_CHAT_UI_ORIGIN_ROLLING_LEVEL   — rolling_level / m7
 * VITE_CHAT_UI_ORIGIN_FIXED_LEVEL     — fixed_level / huggingchat
 */
export function getChatUiOrigin(source) {
  const s = (source || '').toLowerCase()
  if (s === 'rolling_level' || s === 'm7') {
    return (
      envOrigin('VITE_CHAT_UI_ORIGIN_ROLLING_LEVEL') ||
      envOrigin('VITE_CHAT_UI_ORIGIN') ||
      DEFAULT_CHAT_UI_ORIGIN
    )
  }
  if (s === 'fixed_level' || s === 'huggingchat') {
    return (
      envOrigin('VITE_CHAT_UI_ORIGIN_FIXED_LEVEL') ||
      envOrigin('VITE_CHAT_UI_ORIGIN') ||
      DEFAULT_CHAT_UI_ORIGIN
    )
  }
  return envOrigin('VITE_CHAT_UI_ORIGIN') || DEFAULT_CHAT_UI_ORIGIN
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

  const origin = getChatUiOrigin(source)
  return `${origin}/chat/${encodeURIComponent(model)}/conversation/${encodeURIComponent(conv)}?${params.toString()}`
}

export function generatePickId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `pick-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
