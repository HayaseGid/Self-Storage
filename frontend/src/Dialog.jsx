import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import './Dialog.css'

/*
 * Pop-up cảnh báo / xác nhận dùng chung cho toàn bộ ứng dụng.
 *
 * Cách dùng trong component:
 *   const dialog = useDialog()
 *   await dialog.alert({ title: 'Lỗi', message: 'Không lưu được', tone: 'danger' })
 *   const ok = await dialog.confirm({ title: 'Xóa cơ sở?', message: '...', tone: 'danger', confirmLabel: 'Xóa' })
 *   const choice = await dialog.open({ title, message, actions: [{ label, value, variant }] })
 *
 * tone: 'info' | 'success' | 'warning' | 'danger'
 * variant của nút: 'primary' | 'secondary' | 'danger'
 */

const DialogContext = createContext(null)

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

function DialogView({ dialog, onClose }) {
  const cardRef = useRef(null)
  const tone = dialog.tone || 'info'
  const actions = dialog.actions?.length
    ? dialog.actions
    : [{ label: 'Đã hiểu', value: true, variant: 'primary' }]

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusTarget = cardRef.current?.querySelector('[data-autofocus="true"]') ||
      cardRef.current?.querySelector('button')
    focusTarget?.focus()

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

  return (
    <div
      className="ss-dialog-overlay"
      onMouseDown={event => {
        if (event.target === event.currentTarget && dialog.dismissible !== false) {
          onClose(dialog.dismissValue ?? null)
        }
      }}
    >
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

export function DialogProvider({ children }) {
  const [queue, setQueue] = useState([])

  const open = useCallback(options => new Promise(resolve => {
    setQueue(current => [...current, { ...options, resolve, key: `${Date.now()}-${Math.random()}` }])
  }), [])

  const close = useCallback(value => {
    setQueue(current => {
      const [first, ...rest] = current
      first?.resolve(value)
      return rest
    })
  }, [])

  const alert = useCallback(options => open({
    tone: 'info',
    ...options,
    dismissValue: true,
    actions: [{ label: options?.okLabel || 'Đã hiểu', value: true, variant: 'primary' }]
  }), [open])

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
  alert: async options => {
    window.alert([options?.title, options?.message].filter(Boolean).join('\n\n'))
    return true
  },
  confirm: async options => window.confirm([options?.title, options?.message].filter(Boolean).join('\n\n'))
}

export function useDialog() {
  return useContext(DialogContext) || browserFallback
}
