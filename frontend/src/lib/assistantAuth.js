const TOKEN_KEY = 'hc_assistant_token'
const SESSION_KEY = 'hc_assistant_session'

export function getAssistantToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function setAssistantToken(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

export function assistantHeaders() {
  const token = getAssistantToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function getAssistantSessionId(context = 'student') {
  try {
    return sessionStorage.getItem(`${SESSION_KEY}:${context}`) || ''
  } catch {
    return ''
  }
}

export function setAssistantSessionId(id, context = 'student') {
  try {
    if (id) sessionStorage.setItem(`${SESSION_KEY}:${context}`, id)
  } catch {
    /* ignore */
  }
}

export function clearAssistantAuth() {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(`${SESSION_KEY}:student`)
    sessionStorage.removeItem(`${SESSION_KEY}:teacher`)
  } catch {
    /* ignore */
  }
}
