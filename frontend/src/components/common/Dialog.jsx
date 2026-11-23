/**
 * ======================================================================
 * FILE: src/components/common/Dialog.jsx  —  HỘP THOẠI THÔNG BÁO / XÁC NHẬN DÙNG CHUNG TOÀN APP
 * CHỨC NĂNG: Thay cho window.alert / window.confirm: đẹp hơn, hỗ trợ tiếng Việt, trả về Promise để dùng
 *   với await. <DialogProvider> được bọc ở gốc App.jsx; các hộp thoại xếp hàng đợi, hiện lần lượt từng cái.
 *   Cách dùng:
 *     const dialog = useDialog()
 *     await dialog.alert({ title: 'Lỗi', message: 'Không lưu được', tone: 'danger' })
 *     const ok = await dialog.confirm({ title: 'Xóa cơ sở?', message: '...', tone: 'danger', confirmLabel: 'Xóa' })
 *     const choice = await dialog.open({ title, message, actions: [{ label, value, variant }] })
 *   tone: 'info' | 'success' | 'warning' | 'danger';  variant nút: 'primary' | 'secondary' | 'danger'.
 * THÀNH PHẦN CHÍNH:
 *   - DialogProvider : bọc app, quản lý hàng đợi, cung cấp { open, alert, confirm } qua context.
 *   - useDialog      : hook lấy đối tượng dialog (ngoài Provider thì dùng window.alert/confirm).
 *   - DialogView     : (nội bộ) vẽ 1 hộp thoại, xử lý bàn phím / focus / khóa cuộn.
 * DÙNG Ở: src/App.jsx (DialogProvider + useDialog) và useDialog ở rất nhiều nơi: src/pages (customer/CartPage,
 *   customer/CustomerAccount, manager/FacilityManagerAccount, staff/FacilityStaffAccount, admin/AdminAccount,
 *   business/BusinessOperations, payment/PaymentResultPage), src/features (booking/CancelReservation,
 *   contract/ContractRenewal, payment/PendingPayments, return/ReturnInspection, return/StaffReturns, return/UnitReturn).
 *   Đối tượng dialog còn được truyền vào src/services/afterDeposit.js (announce...).
 * PHỤ THUỘC: react (context, hooks), ./Dialog.css.
 * API: Không gọi API.
 * LUỒNG: Component gọi await dialog.confirm({...}) -> open() thêm vào queue -> DialogProvider render DialogView
 *   cho phần tử đầu -> người dùng bấm nút -> close(value) resolve Promise -> component nhận true/false và xử lý tiếp.
 * ======================================================================
 */

/**
 * GHI CHÚ CÁC HÀM (tên: chức năng)
 *   DialogView: Component vẽ 1 hộp thoại: biểu tượng theo tone, tiêu đề, nội dung (chuỗi có \n được tách đoạn), các nút → dùng ở: DialogProvider
 *   DialogProvider: Provider cung cấp dialog cho toàn app (bọc ở App.jsx) → dùng ở: App.jsx
 *   useDialog: Hook lấy đối tượng dialog { open, alert, confirm } → dùng ở: App.jsx (UnitCard, UnitDetailPage +4), CancelReservation.jsx (CancelReservationModal), ContractRenewal.jsx (RenewalSection, RenewalModal) +12
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import './Dialog.css'

// Context chứa { open, alert, confirm } do DialogProvider cung cấp.
const DialogContext = createContext(null)

// Biểu tượng và tiêu đề mặc định theo tone.
const TONE_ICONS = {
  info: 'i',
  success: '✓',
  warning: '!',
  danger: '!'
}

const TONE_TITLES = {
  info: 'Thông báo',
  success: 'Thành công',
  warning: 'Cảnh báo',
  danger: 'Có lỗi xảy ra'
}

/**
 * Component vẽ 1 hộp thoại: biểu tượng theo tone, tiêu đề, nội dung (chuỗi có \n được tách đoạn), các nút.
 * Hỗ trợ bàn phím: Esc để đóng (nếu cho phép), Tab xoay vòng trong hộp thoại; tự focus nút chính;
 * khóa cuộn trang khi mở; bấm ra ngoài nền để đóng (nếu dismissible).
 * @param {{dialog:object, onClose:Function}} props dialog = cấu hình hộp thoại; onClose(value) = đóng và trả giá trị.
 */
function DialogView({ dialog, onClose }) {
  const cardRef = useRef(null)
  const tone = dialog.tone || 'info'
  const actions = dialog.actions?.length
    ? dialog.actions
    : [{ label: 'Đã hiểu', value: true, variant: 'primary' }]

  // Chạy khi hộp thoại hiện (dialog đổi): khóa cuộn trang, focus nút chính, gắn xử lý phím;
  // khi đóng: gỡ xử lý phím, trả lại cuộn trang và focus cũ.
  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusTarget = cardRef.current?.querySelector('[data-autofocus="true"]') ||
      cardRef.current?.querySelector('button')
    focusTarget?.focus()

    // Xử lý phím: Esc -> đóng hộp thoại với dismissValue; Tab/Shift+Tab -> giữ focus quay vòng giữa các nút.
    const onKeyDown = event => {
      if (event.key === 'Escape' && dialog.dismissible !== false) {
        event.preventDefault()
        onClose(dialog.dismissValue ?? null)
        return
      }
      if (event.key === 'Tab' && cardRef.current) {
        const focusable = cardRef.current.querySelectorAll('button')
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus()
    }
  }, [dialog, onClose])

  const primaryIndex = Math.max(0, actions.findIndex(action => action.variant === 'primary' || action.variant === 'danger'))

  // Hộp thoại: lớp nền mờ + khung nội dung
  return (
    <div
      className="ss-dialog-overlay"
      onMouseDown={event => {
        if (event.target === event.currentTarget && dialog.dismissible !== false) {
          onClose(dialog.dismissValue ?? null)
        }
      }}
    >
      {/* Khung hộp thoại: icon, tiêu đề, nội dung, các nút */}
      <div
        ref={cardRef}
        className={`ss-dialog ss-dialog-${tone}`}
        role={tone === 'danger' || tone === 'warning' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="ss-dialog-title"
        aria-describedby="ss-dialog-message"
      >
        <div className="ss-dialog-icon" aria-hidden="true">{TONE_ICONS[tone] || 'i'}</div>
        <div className="ss-dialog-body">
          <h2 id="ss-dialog-title">{dialog.title || TONE_TITLES[tone]}</h2>
          <div id="ss-dialog-message" className="ss-dialog-message">
            {typeof dialog.message === 'string'
              ? dialog.message.split('\n').map((line, index) => <p key={index}>{line}</p>)
              : dialog.message}
          </div>
        </div>
        <div className="ss-dialog-actions">
          {actions.map((action, index) => (
            <button
              key={`${action.label}-${index}`}
              type="button"
              className={`ss-dialog-btn ss-dialog-btn-${action.variant || 'secondary'}`}
              data-autofocus={index === primaryIndex ? 'true' : undefined}
              onClick={() => onClose(action.value)}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Provider cung cấp dialog cho toàn app (bọc ở App.jsx). Quản lý hàng đợi hộp thoại và chỉ hiện hộp thoại đầu tiên.
 * Cung cấp qua context: { open, alert, confirm }.
 * @param {{children: React.ReactNode}} props toàn bộ ứng dụng bên trong.
 */
export function DialogProvider({ children }) {
  const [queue, setQueue] = useState([]) // hàng đợi hộp thoại; phần tử đầu là hộp thoại đang hiện

  // Mở hộp thoại tùy biến; trả Promise sẽ resolve bằng `value` của nút người dùng bấm.
  const open = useCallback(options => new Promise(resolve => {
    setQueue(current => [...current, { ...options, resolve, key: `${Date.now()}-${Math.random()}` }])
  }), [])

  // Đóng hộp thoại đang hiện: resolve Promise của nó bằng value và chuyển sang hộp thoại kế tiếp trong hàng đợi.
  const close = useCallback(value => {
    setQueue(current => {
      const [first, ...rest] = current
      first?.resolve(value)
      return rest
    })
  }, [])

  // Hộp thoại thông báo 1 nút ("Đã hiểu" hoặc okLabel). Resolve true khi đóng.
  const alert = useCallback(options => open({
    tone: 'info',
    ...options,
    dismissValue: true,
    actions: [{ label: options?.okLabel || 'Đã hiểu', value: true, variant: 'primary' }]
  }), [open])

  // Hộp thoại xác nhận 2 nút (Hủy / Xác nhận). Resolve true nếu người dùng xác nhận, false nếu hủy/đóng.
  const confirm = useCallback(options => open({
    tone: 'warning',
    ...options,
    dismissValue: false,
    actions: [
      { label: options?.cancelLabel || 'Hủy', value: false, variant: 'secondary' },
      {
        label: options?.confirmLabel || 'Xác nhận',
        value: true,
        variant: options?.tone === 'danger' ? 'danger' : 'primary'
      }
    ]
  }).then(Boolean), [open])

  const value = React.useMemo(() => ({ open, alert, confirm }), [open, alert, confirm])
  const current = queue[0]

  return (
    <DialogContext.Provider value={value}>
      {children}
      {current && <DialogView key={current.key} dialog={current} onClose={close} />}
    </DialogContext.Provider>
  )
}

/* Khi component nằm ngoài DialogProvider vẫn hoạt động, dùng hộp thoại mặc định của trình duyệt. */
const browserFallback = {
  /**
   * Dự phòng khi không có DialogProvider: dùng window.alert (1 nút) hoặc window.confirm (nhiều nút).
   */
  open: async options => {
    const actions = options?.actions || []
    if (actions.length <= 1) {
      window.alert([options?.title, options?.message].filter(Boolean).join('\n\n'))
      return actions[0]?.value ?? true
    }
    const ok = window.confirm([options?.title, options?.message].filter(Boolean).join('\n\n'))
    const positive = actions.find(action => action.variant === 'primary' || action.variant === 'danger')
    return ok ? positive?.value ?? true : options?.dismissValue ?? null
  },
  /**
   * Dự phòng alert bằng window.alert.
   */
  alert: async options => {
    window.alert([options?.title, options?.message].filter(Boolean).join('\n\n'))
    return true
  },
  /**
   * Dự phòng confirm bằng window.confirm.
   */
  confirm: async options => window.confirm([options?.title, options?.message].filter(Boolean).join('\n\n'))
}

/**
 * Hook lấy đối tượng dialog { open, alert, confirm }. Nằm ngoài DialogProvider thì trả bản dự phòng của trình duyệt.
 * @returns {{open:Function, alert:Function, confirm:Function}} các hàm đều trả Promise.
 */
export function useDialog() {
  return useContext(DialogContext) || browserFallback
}
