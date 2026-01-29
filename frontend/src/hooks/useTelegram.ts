import { useCallback, useMemo } from 'react'

interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
}

interface ThemeParams {
  bg_color?: string
  text_color?: string
  hint_color?: string
  link_color?: string
  button_color?: string
  button_text_color?: string
  secondary_bg_color?: string
}

interface WebApp {
  initData: string
  initDataUnsafe: {
    user?: TelegramUser
    query_id?: string
    auth_date?: number
    hash?: string
  }
  version: string
  platform: string
  colorScheme: 'light' | 'dark'
  themeParams: ThemeParams
  isExpanded: boolean
  viewportHeight: number
  viewportStableHeight: number
  headerColor: string
  backgroundColor: string
  ready: () => void
  expand: () => void
  close: () => void
  enableClosingConfirmation: () => void
  disableClosingConfirmation: () => void
  setHeaderColor: (color: string) => void
  setBackgroundColor: (color: string) => void
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void
    selectionChanged: () => void
  }
  showPopup: (params: {
    title?: string
    message: string
    buttons?: Array<{
      id?: string
      type?: 'default' | 'ok' | 'close' | 'cancel' | 'destructive'
      text?: string
    }>
  }, callback?: (buttonId: string) => void) => void
  showAlert: (message: string, callback?: () => void) => void
  showConfirm: (message: string, callback?: (confirmed: boolean) => void) => void
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: WebApp
    }
  }
}

export const useTelegram = () => {
  const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined

  const user = useMemo(() => tg?.initDataUnsafe?.user, [tg])
  const initData = useMemo(() => tg?.initData || '', [tg])
  const themeParams = useMemo(() => tg?.themeParams, [tg])
  const colorScheme = useMemo(() => tg?.colorScheme || 'light', [tg])

  const ready = useCallback(() => {
    tg?.ready()
  }, [tg])

  const close = useCallback(() => {
    tg?.close()
  }, [tg])

  const expand = useCallback(() => {
    tg?.expand()
  }, [tg])

  const hapticImpact = useCallback((style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'light') => {
    tg?.HapticFeedback?.impactOccurred(style)
  }, [tg])

  const hapticNotification = useCallback((type: 'error' | 'success' | 'warning') => {
    tg?.HapticFeedback?.notificationOccurred(type)
  }, [tg])

  const hapticSelection = useCallback(() => {
    tg?.HapticFeedback?.selectionChanged()
  }, [tg])

  const showPopup = useCallback((
    params: {
      title?: string
      message: string
      buttons?: Array<{
        id?: string
        type?: 'default' | 'ok' | 'close' | 'cancel' | 'destructive'
        text?: string
      }>
    },
    callback?: (buttonId: string) => void
  ) => {
    tg?.showPopup(params, callback)
  }, [tg])

  const showAlert = useCallback((message: string, callback?: () => void) => {
    tg?.showAlert(message, callback)
  }, [tg])

  const showConfirm = useCallback((message: string, callback?: (confirmed: boolean) => void) => {
    tg?.showConfirm(message, callback)
  }, [tg])

  return {
    tg,
    user,
    initData,
    themeParams,
    colorScheme,
    ready,
    close,
    expand,
    hapticImpact,
    hapticNotification,
    hapticSelection,
    showPopup,
    showAlert,
    showConfirm,
  }
}


