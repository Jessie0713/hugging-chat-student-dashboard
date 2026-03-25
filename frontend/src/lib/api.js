const API_BASE = `${window.location.protocol}//${window.location.hostname}:8000`

export async function apiGet(url) {
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
