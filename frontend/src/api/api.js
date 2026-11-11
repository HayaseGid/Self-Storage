/**
 * ======================================================================
 * FILE: src/api/api.js  —  TẦNG GỌI HTTP (HTTP CLIENT) DÙNG CHUNG CHO TOÀN BỘ FRONTEND
 * Tương đương: lớp "client" gọi tới các Controller của backend ASP.NET Core.
 *
 * Công dụng:
 * - Là cửa ngõ DUY NHẤT để frontend gọi REST API backend (mọi file khác đều gọi qua
 *   apiGet / apiPost / apiPut / apiDelete ở đây, không gọi fetch trực tiếp).
 * - Tự gắn header xác thực: "Authorization: Bearer <JWT>" (nếu user có token)
 *   hoặc "X-User-Email" (phiên cũ chưa có JWT).
 * - Tự gắn header "X-Simulated-Date" khi đang bật Demo Clock (giả lập ngày).
 * - Tự đặt timeout 20 giây, đổi mọi lỗi (mạng, timeout, HTTP 4xx/5xx) thành ApiError
 *   có câu thông báo tiếng Việt để giao diện hiển thị.
 * - Khi backend trả 401 + code TOKEN_INVALID: xóa phiên đăng nhập và chuyển về /login.
 *
 * Luồng 1 request:
 *   Component -> apiGet('/api/...') -> apiRequest() -> fetch(VITE_API_URL + path)
 *   -> Backend Middleware (JwtIdentityMiddleware) -> Controller -> Service -> Repository -> DB
 *   -> JSON trả về -> apiRequest() parse JSON -> trả data (hoặc ném ApiError) -> Component.
 *
 * Cấu hình: VITE_API_URL trong file .env (mặc định http://localhost:5046).
 * Phiên đăng nhập lưu ở localStorage key 'storespace_current_user' ({ email, role, token, ... }).
 * ======================================================================
 */
import { SIMULATED_DATE_HEADER, getSimulatedDateISO } from '../demoClock/demoClock'

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5046').replace(/\/+$/, '')
const CURRENT_USER_KEY = 'storespace_current_user'
const REQUEST_TIMEOUT_MS = 20000

/**
 * Đọc thông tin người dùng đang đăng nhập từ localStorage (key 'storespace_current_user').
 * Nếu dữ liệu hỏng / không phải object thì xóa luôn để tránh lỗi về sau.
 * @returns {object|null} user ({ email, role, token, ... }) hoặc null nếu chưa đăng nhập.
 */
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

/*
 * Câu thông báo tiếng Việt theo mã lỗi HTTP, dùng khi backend không gửi kèm nội dung
 * (ví dụ Forbid(), Unauthorized(), NotFound() trả về rỗng) hoặc chỉ gửi tiêu đề tiếng Anh.
 */
const STATUS_MESSAGES = {
  400: 'Dữ liệu gửi lên chưa hợp lệ. Vui lòng kiểm tra lại thông tin đã nhập.',
  401: 'Phiên đăng nhập đã hết hoặc bạn chưa đăng nhập. Vui lòng đăng nhập lại.',
  403: 'Tài khoản của bạn không có quyền thực hiện thao tác này.',
  404: 'Không tìm thấy dữ liệu yêu cầu. Có thể dữ liệu đã bị xóa hoặc thay đổi.',
  405: 'Thao tác này không được hỗ trợ.',
  408: 'Máy chủ phản hồi quá lâu. Vui lòng thử lại.',
  409: 'Dữ liệu vừa thay đổi hoặc bị trùng (ví dụ kho vừa có người khác đặt). Vui lòng tải lại trang và thử lại.',
  413: 'Dữ liệu gửi lên quá lớn.',
  422: 'Dữ liệu chưa đúng quy định. Vui lòng kiểm tra lại.',
  429: 'Bạn thao tác quá nhanh. Vui lòng đợi một lát rồi thử lại.',
  500: 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau ít phút.',
  502: 'Không kết nối được tới máy chủ. Vui lòng thử lại sau.',
  503: 'Máy chủ đang bảo trì hoặc quá tải. Vui lòng thử lại sau.',
  504: 'Máy chủ phản hồi quá lâu. Vui lòng thử lại.'
}

const NETWORK_ERROR_MESSAGE = 'Không kết nối được tới máy chủ. Kiểm tra kết nối mạng hoặc đảm bảo backend đang chạy, rồi thử lại.'
const TIMEOUT_MESSAGE = 'Máy chủ phản hồi quá lâu. Vui lòng thử lại.'

/* Các tiêu đề lỗi mặc định (tiếng Anh) của ASP.NET Core: không hiển thị cho người dùng. */
const GENERIC_ENGLISH = /^(bad request|unauthorized|forbidden|not found|conflict|internal server error|method not allowed|unsupported media type|one or more validation errors occurred\.?|an error occurred while processing your request\.?)$/i

/* Dịch các thông báo kiểm tra dữ liệu mặc định của ASP.NET Core sang tiếng Việt. */
/**
 * Dịch câu lỗi kiểm tra dữ liệu (model validation) tiếng Anh mặc định của ASP.NET Core
 * sang tiếng Việt, ví dụ "The Email field is required." -> "Vui lòng nhập trường Email.".
 * @param {string} message câu lỗi gốc từ backend.
 * @returns {string} câu lỗi đã dịch (giữ nguyên nếu không khớp mẫu nào).
 */
function translateValidationMessage(message) {
  return message
    .replace(/^The (\w+) field is required\.?$/i, 'Vui lòng nhập trường $1.')
    .replace(/^The JSON value could not be converted to .*$/i, 'Có trường dữ liệu sai định dạng.')
    .replace(/^The field (\w+) must be between (\S+) and (\S+)\.?$/i, 'Trường $1 phải nằm trong khoảng $2 đến $3.')
    .replace(/^The field (\w+) must be a string or array type with a maximum length of '?(\d+)'?\.?$/i, 'Trường $1 dài tối đa $2 ký tự.')
    .replace(/^The (\w+) field is not a valid e-mail address\.?$/i, 'Email không hợp lệ.')
}

/**
 * Kiểm tra một chuỗi lỗi có "đáng hiển thị" không: phải là chuỗi khác rỗng và không phải
 * tiêu đề lỗi tiếng Anh chung chung của ASP.NET (Bad Request, Not Found, ...).
 */
function isUsefulMessage(text) {
  return typeof text === 'string' && text.trim() && !GENERIC_ENGLISH.test(text.trim())
}

/**
 * Rút ra câu thông báo lỗi tiếng Việt phù hợp nhất từ body lỗi backend trả về.
 * Thứ tự ưu tiên: data.message -> data.detail -> data.errors (lỗi validation) -> data.title
 * -> body dạng chuỗi ngắn -> câu mặc định theo mã HTTP (STATUS_MESSAGES).
 * @param {any} data body lỗi đã parse (object JSON hoặc chuỗi).
 * @param {number} status mã HTTP.
 * @returns {string} câu thông báo hiển thị cho người dùng.
 */
function getErrorMessage(data, status) {
  if (isUsefulMessage(data?.message)) return data.message
  if (isUsefulMessage(data?.detail)) return data.detail
  if (data?.errors && typeof data.errors === 'object') {
    const messages = Object.values(data.errors)
      .flatMap(value => Array.isArray(value) ? value : [value])
      .filter(value => typeof value === 'string' && value.trim())
      .map(translateValidationMessage)
    if (messages.length) return [...new Set(messages)].join(' ')
  }
  if (isUsefulMessage(data?.title)) return data.title
  if (typeof data === 'string' && data.trim() && data.length < 300 && !/<html/i.test(data) && !GENERIC_ENGLISH.test(data.trim())) {
    return data.trim()
  }
  return STATUS_MESSAGES[status] || (status >= 500 ? STATUS_MESSAGES[500] : `Có lỗi xảy ra (mã ${status}). Vui lòng thử lại.`)
}

/*
 * Lỗi trả về từ API. Ngoài message tiếng Việt còn có:
 *   error.status  - mã HTTP (0 nếu mất kết nối / quá thời gian)
 *   error.code    - 'NETWORK' | 'TIMEOUT' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION' | 'SERVER' | 'HTTP'
 *   error.data    - nội dung gốc backend trả về (nếu có)
 */
export class ApiError extends Error {
  /**
   * Tạo đối tượng lỗi API.
   * @param {string} message câu thông báo tiếng Việt.
   * @param {{status?:number, code?:string, data?:any}} options status = mã HTTP (0 khi mất mạng/timeout),
   *   code = mã lỗi rút gọn ('NETWORK','TIMEOUT','UNAUTHORIZED',...), data = body gốc backend trả về.
   */
  constructor(message, { status = 0, code = 'HTTP', data = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.data = data
  }
}

/**
 * Đổi mã HTTP thành mã lỗi rút gọn để code giao diện dễ rẽ nhánh
 * (401 -> UNAUTHORIZED, 403 -> FORBIDDEN, 404 -> NOT_FOUND, 409 -> CONFLICT,
 * 400/422 -> VALIDATION, >=500 -> SERVER, còn lại -> HTTP).
 */
function codeForStatus(status) {
  if (status === 401) return 'UNAUTHORIZED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status === 409) return 'CONFLICT'
  if (status === 400 || status === 422) return 'VALIDATION'
  if (status >= 500) return 'SERVER'
  return 'HTTP'
}

/**
 * HÀM LÕI gửi 1 request HTTP tới backend. Mọi hàm apiGet/apiPost/apiPut/apiDelete đều gọi hàm này.
 * Các bước:
 *  1. Lấy user hiện tại (trừ các API /api/auth/* như đăng nhập/đăng ký thì không gửi danh tính).
 *  2. Gắn Content-Type JSON nếu có body; gắn Bearer token hoặc X-User-Email.
 *  3. Gắn header X-Simulated-Date nếu đang giả lập ngày (Demo Clock).
 *  4. Gọi fetch với AbortController để tự hủy sau `timeout` ms.
 *  5. Đọc body, thử parse JSON (không được thì giữ dạng chuỗi).
 *  6. Nếu HTTP lỗi: 401 TOKEN_INVALID thì xóa phiên + chuyển /login; sau đó ném ApiError.
 * @param {string} path đường dẫn API, ví dụ '/api/catalog/state'.
 * @param {{method?:string, body?:any, headers?:object, timeout?:number}} options tùy chọn request.
 * @returns {Promise<any>} dữ liệu JSON backend trả về (null nếu body rỗng / 204).
 * @throws {ApiError} khi mất mạng, quá thời gian hoặc backend trả mã lỗi.
 */
export async function apiRequest(path, { method = 'GET', body, headers = {}, timeout = REQUEST_TIMEOUT_MS } = {}) {
  const requestHeaders = new Headers(headers)
  const currentUser = path.startsWith('/api/auth/') ? null : getCurrentUser()

  if (body !== undefined && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json')
  }
  // Có JWT thì gửi "Authorization: Bearer"; backend tự lấy email từ token.
  // Phiên cũ (đăng nhập trước khi có JWT) mới dùng header X-User-Email.
  const sentToken = Boolean(currentUser?.token)
  if (sentToken) requestHeaders.set('Authorization', `Bearer ${currentUser.token}`)
  else if (currentUser?.email) requestHeaders.set('X-User-Email', currentUser.email)

  const simulatedDate = getSimulatedDateISO()
  if (simulatedDate) requestHeaders.set(SIMULATED_DATE_HEADER, simulatedDate)

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeout) : null

  let response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller?.signal
    })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ApiError(TIMEOUT_MESSAGE, { status: 0, code: 'TIMEOUT' })
    }
    throw new ApiError(NETWORK_ERROR_MESSAGE, { status: 0, code: 'NETWORK' })
  } finally {
    if (timer) clearTimeout(timer)
  }

  let responseText = ''
  try {
    responseText = response.status === 204 ? '' : await response.text()
  } catch {
    responseText = ''
  }
  let data = null
  if (responseText) {
    try {
      data = JSON.parse(responseText)
    } catch {
      data = responseText
    }
  }

  if (!response.ok) {
    // Token hết hạn / không hợp lệ (middleware JWT trả code TOKEN_INVALID): xóa phiên và về trang đăng nhập.
    if (response.status === 401 && sentToken && data?.code === 'TOKEN_INVALID') {
      localStorage.removeItem(CURRENT_USER_KEY)
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.history.pushState({}, '', '/login')
        window.dispatchEvent(new PopStateEvent('popstate'))
      }
    }
    throw new ApiError(getErrorMessage(data, response.status), {
      status: response.status,
      code: codeForStatus(response.status),
      data
    })
  }
  return data
}

/**
 * Gửi request GET (đọc dữ liệu). Ví dụ: apiGet('/api/catalog/state').
 */
export function apiGet(path) {
  return apiRequest(path)
}

/**
 * Gửi request POST kèm body JSON (tạo mới / thực hiện hành động). Ví dụ: apiPost('/api/reservation', {...}).
 */
export function apiPost(path, body) {
  return apiRequest(path, { method: 'POST', body })
}

/**
 * Gửi request PUT kèm body JSON (cập nhật dữ liệu). Ví dụ: apiPut('/api/admin/users/5', {...}).
 */
export function apiPut(path, body) {
  return apiRequest(path, { method: 'PUT', body })
}

/**
 * Gửi request DELETE (xóa dữ liệu). Ví dụ: apiDelete('/api/unit-types/3').
 */
export function apiDelete(path) {
  return apiRequest(path, { method: 'DELETE' })
}
