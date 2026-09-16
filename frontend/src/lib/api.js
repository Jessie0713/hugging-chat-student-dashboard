// 將 API_BASE 設為空字串，讓瀏覽器自動對當前網域發出請求
const API_BASE = ''

/** FastAPI 常回 JSON：`{"detail":"..."}` 或驗證錯誤陣列 */
async function errorMessageFromResponse(r) {
  const text = await r.text()
  try {
    const j = JSON.parse(text)
    if (j?.detail != null) {
      const d = j.detail
      if (Array.isArray(d)) {
        return d
          .map((x) => (typeof x === 'object' && x?.msg ? x.msg : String(x)))
          .join('；')
      }
      return String(d)
    }
  } catch {
    /* fallthrough */
  }
  return text || `HTTP ${r.status}`
}

export async function apiGet(url, options = {}) {
  const headers = { ...(options.headers || {}) }
  const r = await fetch(`${API_BASE}${url}`, { headers })
  if (!r.ok) throw new Error(await errorMessageFromResponse(r))
  return r.json()
}

export async function apiPost(url, body, options = {}) {
  const r = await fetch(`${API_BASE}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: body ? JSON.stringify(body) : '{}',
  })
  if (!r.ok) throw new Error(await errorMessageFromResponse(r))
  return r.json()
}