const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5046').replace(/\/+$/, '')
const CURRENT_USER_KEY = 'storespace_current_user'

function getCurrentUser() {
  const storedUser = localStorage.getItem(CURRENT_USER_KEY)
  if (!storedUser) return null

  try {
    const user = JSON.parse(storedUser)
    if (!user || typeof user !== 'object' || Array.isArray(user)) {
      localStorage.removeItem(CURRENT_USER_KEY)
      return null
    }
    return user
  } catch {
    localStorage.removeItem(CURRENT_USER_KEY)
    return null
  }
}

function getErrorMessage(data, status, statusText) {
  if (typeof data?.message === 'string') return data.message
  if (typeof data?.detail === 'string') return data.detail
  if (typeof data?.title === 'string') return data.title
  if (data?.errors && typeof data.errors === 'object') {
    const messages = Object.values(data.errors)
      .flatMap(value => Array.isArray(value) ? value : [value])
      .filter(value => typeof value === 'string' && value.trim())
    if (messages.length) return messages.join(' ')
  }
  return statusText ? `Lỗi ${status}: ${statusText}` : `Lỗi ${status}`
}

export async function apiRequest(path, { method = 'GET', body, headers = {} } = {}) {
  const requestHeaders = new Headers(headers)
  const currentUser = path.startsWith('/api/auth/') ? null : getCurrentUser()

  if (body !== undefined && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json')
  }
  if (currentUser?.email) requestHeaders.set('X-User-Email', currentUser.email)

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body)
  })

  const responseText = response.status === 204 ? '' : await response.text()
  let data = null
  if (responseText) {
    try {
      data = JSON.parse(responseText)
    } catch {
      data = responseText
    }
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(data, response.status, response.statusText))
  }
  return data
}

export function apiGet(path) {
  return apiRequest(path)
}

export function apiPost(path, body) {
  return apiRequest(path, { method: 'POST', body })
}

export function apiPut(path, body) {
  return apiRequest(path, { method: 'PUT', body })
}

export function apiDelete(path) {
  return apiRequest(path, { method: 'DELETE' })
}
