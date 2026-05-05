// 將 API_BASE 設為空字串，讓瀏覽器自動對當前網域發出請求
const API_BASE = '' 

export async function apiGet(url) {
  // 實際上執行的是 fetch('/api/m7/...')
  const r = await fetch(`${API_BASE}${url}`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function apiPost(url, body) {
  const r = await fetch(`${API_BASE}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : '{}',
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}