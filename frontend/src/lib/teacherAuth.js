const STORAGE_KEY = 'hc_teacher_code'

export const TEACHER_ACCESS_CODE = '111111'

export function getTeacherCode() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export function setTeacherCode(code) {
  try {
    sessionStorage.setItem(STORAGE_KEY, String(code || ''))
  } catch {
    /* ignore */
  }
}

export function clearTeacherCode() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function teacherHeaders() {
  const code = getTeacherCode()
  return code ? { 'X-Teacher-Code': code } : {}
}
