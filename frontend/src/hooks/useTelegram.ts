import { useCallback, useMemo } from 'react'

interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
  photo_url?: string
}

// Parse initData string into object
function parseInitData(initData: string): {
  user?: TelegramUser
  query_id?: string
  auth_date?: number
  hash?: string
  start_param?: string
} {
  if (!initData) return {}
  
  try {
    const params = new URLSearchParams(initData)
    const userStr = params.get('user')
    const user = userStr ? JSON.parse(decodeURIComponent(userStr)) : undefined
    
    return {
      user,
      query_id: params.get('query_id') || undefined,
      auth_date: params.get('auth_date') ? parseInt(params.get('auth_date')!) : undefined,
      hash: params.get('hash') || undefined,
      start_param: params.get('start_param') || undefined,
    }
  } catch {
    return {}
  }
}

// Get dev initData from env
function getDevInitData(): string {
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_INIT_DATA) {
    return import.meta.env.VITE_DEV_INIT_DATA
  }
  return ''
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

interface BackButton {
  isVisible: boolean
  onClick: (callback: () => void) => void
  offClick: (callback: () => void) => void
  show: () => void
  hide: () => void
}

interface WebApp {
  initData: string
  initDataUnsafe: {
    user?: TelegramUser
    query_id?: string
    auth_date?: number
    hash?: string
    start_param?: string
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
  BackButton: BackButton
  ready: () => void
  expand: () => void
  close: () => void
  enableClosingConfirmation: () => void
  disableClosingConfirmation: () => void
  enableVerticalSwipes: () => void
  disableVerticalSwipes: () => void
  setHeaderColor: (color: string) => void
  setBackgroundColor: (color: string) => void
  openLink: (url: string, options?: { try_instant_view?: boolean }) => void
  openTelegramLink: (url: string) => void
  switchInlineQuery: (query: string, choose_chat_types?: string[]) => void
  shareUrl: (url: string, text?: string) => void
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
  const isDevMode = import.meta.env.DEV && !tg?.initData && !!getDevInitData()
  
  // Parse dev initData if in dev mode
  const devInitDataParsed = useMemo(() => {
    if (isDevMode) {
      return parseInitData(getDevInitData())
    }
    return null
  }, [isDevMode])

  const user = useMemo(() => {
    if (tg?.initDataUnsafe?.user) return tg.initDataUnsafe.user
    if (devInitDataParsed?.user) return devInitDataParsed.user
    return undefined
  }, [tg, devInitDataParsed])
  
  const initData = useMemo(() => {
    if (tg?.initData) return tg.initData
    return getDevInitData()
  }, [tg])
  
  const themeParams = useMemo(() => tg?.themeParams, [tg])
  const colorScheme = useMemo(() => tg?.colorScheme || 'light', [tg])
  
  const startParam = useMemo(() => {
    if (tg?.initDataUnsafe?.start_param) return tg.initDataUnsafe.start_param
    if (devInitDataParsed?.start_param) return devInitDataParsed.start_param
    return undefined
  }, [tg, devInitDataParsed])
  
  const backButton = useMemo(() => tg?.BackButton, [tg])

  const ready = useCallback(() => {
    tg?.ready()
  }, [tg])

  const close = useCallback(() => {
    tg?.close()
  }, [tg])

  const expand = useCallback(() => {
    tg?.expand()
  }, [tg])

  const disableVerticalSwipes = useCallback(() => {
    tg?.disableVerticalSwipes()
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

  const openLink = useCallback((url: string) => {
    tg?.openLink(url)
  }, [tg])

  const openTelegramLink = useCallback((url: string) => {
    tg?.openTelegramLink(url)
  }, [tg])

  // Share text - copy to clipboard and show confirmation
  const shareText = useCallback((text: string) => {
    // Copy to clipboard
    navigator.clipboard?.writeText(text).then(() => {
      // Show success message
      if (tg) {
        tg.showPopup({
          title: 'Скопировано!',
          message: 'Текст заметки скопирован. Теперь вы можете отправить его в любой чат.',
          buttons: [{ type: 'ok', text: 'OK' }]
        })
        tg.HapticFeedback?.notificationOccurred('success')
      } else {
        alert('Текст скопирован в буфер обмена!')
      }
    }).catch(() => {
      // Fallback: show the text in popup for manual copy
      if (tg) {
        tg.showAlert('Не удалось скопировать. Попробуйте вручную.')
      }
    })
  }, [tg])
  
  // Forward to chat - uses Telegram's native forward
  const forwardToChat = useCallback((text: string) => {
    if (!tg) return
    
    // Use switchInlineQuery to share via bot
    try {
      tg.switchInlineQuery(text, ['users', 'groups', 'channels'])
    } catch {
      // Fallback to copy
      shareText(text)
    }
  }, [tg, shareText])

  // Share URL via Telegram native share
  const shareUrl = useCallback((url: string, text?: string) => {
    if (tg?.shareUrl) {
      tg.shareUrl(url, text)
    } else {
      // Fallback: open Telegram share link
      const shareLink = `https://t.me/share/url?url=${encodeURIComponent(url)}${text ? `&text=${encodeURIComponent(text)}` : ''}`
      tg?.openTelegramLink(shareLink)
    }
  }, [tg])

  // Show/hide back button
  const showBackButton = useCallback((callback: () => void) => {
    if (tg?.BackButton) {
      tg.BackButton.onClick(callback)
      tg.BackButton.show()
    }
  }, [tg])

  const hideBackButton = useCallback(() => {
    if (tg?.BackButton) {
      tg.BackButton.hide()
    }
  }, [tg])

  const onBackButtonClick = useCallback((callback: () => void) => {
    if (tg?.BackButton) {
      tg.BackButton.offClick(() => {})
      tg.BackButton.onClick(callback)
    }
  }, [tg])

  // Set header color
  const setHeaderColor = useCallback((color: 'bg_color' | 'secondary_bg_color' | string) => {
    tg?.setHeaderColor(color)
  }, [tg])

  // Set background color
  const setBackgroundColor = useCallback((color: 'bg_color' | 'secondary_bg_color' | string) => {
    tg?.setBackgroundColor(color)
  }, [tg])

  return {
    tg,
    user,
    initData,
    themeParams,
    colorScheme,
    startParam,
    backButton,
    isDevMode,
    ready,
    close,
    expand,
    disableVerticalSwipes,
    hapticImpact,
    hapticNotification,
    hapticSelection,
    showPopup,
    showAlert,
    showConfirm,
    openLink,
    openTelegramLink,
    shareText,
    shareUrl,
    forwardToChat,
    showBackButton,
    hideBackButton,
    onBackButtonClick,
    setHeaderColor,
    setBackgroundColor,
  }
}
