import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Language = 'ru' | 'en'

const translationsRu = {
  // App
  notes: 'Заметки',
  profile: 'Профиль',
  
  // Profile page
  myProfile: 'Мой профиль',
  language: 'Язык',
  subscription: 'Подписка',
  russian: 'Русский',
  english: 'English',
  
  // Subscription tiers
  free: 'Free',
  pro: 'Pro',
  ultra: 'Ultra',
  trial: 'Trial',
  trialDaysLeft: 'Пробный период: {days} дн.',
  currentPlan: 'Текущий план',
  upgrade: 'Улучшить',
  subscribePlan: 'Подписаться',
  
  // Features
  features: 'Возможности',
  aiSummary: 'AI-суммаризация',
  voiceNotes: 'Голосовые заметки',
  aiChat: 'AI-чат по заметкам',
  syncNotes: 'Синхронизация',
  notionSync: 'Notion',
  obsidianSync: 'Obsidian',
  anytypeSync: 'Anytype',
  
  // Limits
  unlimited: 'Безлимит',
  perMonth: '/мес',
  minutes: 'мин',
  summaries: 'сум.',
  soon: 'Скоро',
  
  // Feature descriptions
  noAiFeatures: 'Нет AI функций',
  basicNotes: 'Только текстовые заметки',
  summaryLimit: 'до {limit} сум./мес',
  voiceLimit: 'до {limit} мин/мес',
  basicAiChat: 'Базовый (медленный)',
  fastAiChat: 'Быстрый + контекст',
  manualSync: 'Ручная отправка',
  autoSync: 'Авто-синхронизация',
  
  // Pricing
  pricing: 'Стоимость',
  monthly: 'В месяц',
  yearly: 'В год',
  savings: 'Экономия',
  
  // Notes list
  noNotes: 'Нет заметок',
  noNotesDesc: 'Отправьте голосовое или текстовое сообщение боту, чтобы создать первую заметку',
  searchPlaceholder: 'Поиск заметок...',
  searchNoResults: 'Ничего не найдено',
  searchNoResultsDesc: 'Попробуйте изменить поисковый запрос',
  results: 'Результаты',
  
  // Date groups
  today: 'Сегодня',
  yesterday: 'Вчера',
  thisWeek: 'На этой неделе',
  thisMonth: 'В этом месяце',
  earlier: 'Ранее',
  
  // Actions
  back: 'Назад',
  save: 'Сохранить',
  cancel: 'Отмена',
  delete: 'Удалить',
  share: 'Поделиться',
  edit: 'Редактировать',
  copy: 'Копировать',
  done: 'Готово',
  
  // Paywall
  unlockFeature: 'Разблокировать функцию',
  featureRequires: 'Эта функция требует',
  upgradeToAccess: 'Обновите подписку для доступа',
  trialExpired: 'Пробный период истёк',
  trialExpiredDesc: 'Оформите подписку, чтобы продолжить пользоваться AI функциями',
  
  // Telegram Stars
  payWithStars: 'Оплатить ⭐️ Stars',
  starsBalance: 'Баланс Stars',
  
  // Errors
  error: 'Ошибка',
  tryAgain: 'Попробуйте снова',
  
  // Success messages
  languageChanged: 'Язык изменён',
  subscriptionActivated: 'Подписка активирована!',
  
  // Note detail
  noteCreated: 'Создано',
  voiceNote: 'Голосовая',
  textNote: 'Текст',
  duration: 'Длительность',
  
  // Misc
  allNotesSync: 'Все заметки синхронизируются с этим аккаунтом',
  version: 'Версия',
  
  // Sync settings
  syncSettings: 'Синхронизация',
  syncDescription: 'Синхронизируйте заметки с внешними сервисами',
  comingSoon: 'Скоро',
  connected: 'Подключено',
  connect: 'Подключить',
  connecting: 'Подключение...',
  disconnect: 'Отключить',
  database: 'База данных',
  syncMode: 'Режим синхронизации',
  lastSync: 'Последняя синхр.',
  never: 'Никогда',
  justNow: 'Только что',
  minutesAgo: '{count} мин. назад',
  hoursAgo: '{count} ч. назад',
  
  // Sync modes
  syncModeTwoWay: 'Двусторонняя',
  syncModeTwoWayDesc: 'Изменения синхронизируются в обе стороны',
  syncModeAppToNotion: 'Приложение → Notion',
  syncModeAppToNotionDesc: 'Только отправка из приложения в Notion',
  syncModeNotionToApp: 'Notion → Приложение',
  syncModeNotionToAppDesc: 'Только получение из Notion в приложение',
  selectSyncMode: 'Выберите режим синхронизации',
  
  // Database picker
  selectDatabase: 'Выберите базу данных',
  selectDatabaseDescription: 'Выберите базу данных Notion для синхронизации заметок',
  
  // Sync info
  howSyncWorks: 'Как работает синхронизация',
  proSyncManual: 'На Pro плане — ручная синхронизация',
  proSyncPerNote: 'Нажмите кнопку синхронизации на каждой заметке',
  ultraSyncAuto: 'Автоматическая синхронизация в фоне',
  ultraSyncBackground: 'Все заметки синхронизируются автоматически',
  syncRequiresPaidPlan: 'Синхронизация доступна на Pro и Ultra планах',
  
  // Sync actions
  syncNote: 'Синхронизировать',
  syncing: 'Синхронизация...',
  synced: 'Синхронизировано',
  syncError: 'Ошибка синхронизации',
  syncConflict: 'Конфликт',
  openInNotion: 'Открыть в Notion',
  
  // Conflict resolution
  resolveConflict: 'Разрешить конфликт',
  keepLocal: 'Оставить локальную версию',
  keepExternal: 'Взять версию из Notion',
  keepBoth: 'Сохранить обе версии',
  
  // Errors and permissions
  syncRequiresPro: 'Для синхронизации нужен Pro план',
  upgradeForSync: 'Обновите до Pro для синхронизации',
  upgradeForAutoSync: 'Авто-синхронизация доступна на Ultra плане',
  upgradeToUnlock: 'Обновите подписку для доступа',
  connectionFailed: 'Не удалось подключиться',
  operationFailed: 'Операция не выполнена',
}

const translationsEn: typeof translationsRu = {
  // App
  notes: 'Notes',
  profile: 'Profile',
  
  // Profile page
  myProfile: 'My Profile',
  language: 'Language',
  subscription: 'Subscription',
  russian: 'Русский',
  english: 'English',
  
  // Subscription tiers
  free: 'Free',
  pro: 'Pro',
  ultra: 'Ultra',
  trial: 'Trial',
  trialDaysLeft: 'Trial: {days} days left',
  currentPlan: 'Current Plan',
  upgrade: 'Upgrade',
  subscribePlan: 'Subscribe',
  
  // Features
  features: 'Features',
  aiSummary: 'AI Summary',
  voiceNotes: 'Voice Notes',
  aiChat: 'AI Chat',
  syncNotes: 'Sync',
  notionSync: 'Notion',
  obsidianSync: 'Obsidian',
  anytypeSync: 'Anytype',
  
  // Limits
  unlimited: 'Unlimited',
  perMonth: '/mo',
  minutes: 'min',
  summaries: 'sum.',
  soon: 'Soon',
  
  // Feature descriptions
  noAiFeatures: 'No AI features',
  basicNotes: 'Text notes only',
  summaryLimit: 'up to {limit} sum./mo',
  voiceLimit: 'up to {limit} min/mo',
  basicAiChat: 'Basic (slow)',
  fastAiChat: 'Fast + context',
  manualSync: 'Manual export',
  autoSync: 'Auto-sync',
  
  // Pricing
  pricing: 'Pricing',
  monthly: 'Monthly',
  yearly: 'Yearly',
  savings: 'Save',
  
  // Notes list
  noNotes: 'No Notes',
  noNotesDesc: 'Send a voice or text message to the bot to create your first note',
  searchPlaceholder: 'Search notes...',
  searchNoResults: 'Nothing found',
  searchNoResultsDesc: 'Try changing your search query',
  results: 'Results',
  
  // Date groups
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This Week',
  thisMonth: 'This Month',
  earlier: 'Earlier',
  
  // Actions
  back: 'Back',
  save: 'Save',
  cancel: 'Cancel',
  delete: 'Delete',
  share: 'Share',
  edit: 'Edit',
  copy: 'Copy',
  done: 'Done',
  
  // Paywall
  unlockFeature: 'Unlock Feature',
  featureRequires: 'This feature requires',
  upgradeToAccess: 'Upgrade to access this feature',
  trialExpired: 'Trial Expired',
  trialExpiredDesc: 'Subscribe to continue using AI features',
  
  // Telegram Stars
  payWithStars: 'Pay with ⭐️ Stars',
  starsBalance: 'Stars Balance',
  
  // Errors
  error: 'Error',
  tryAgain: 'Try again',
  
  // Success messages
  languageChanged: 'Language changed',
  subscriptionActivated: 'Subscription activated!',
  
  // Note detail
  noteCreated: 'Created',
  voiceNote: 'Voice',
  textNote: 'Text',
  duration: 'Duration',
  
  // Misc
  allNotesSync: 'All notes are synced with this account',
  version: 'Version',
  
  // Sync settings
  syncSettings: 'Sync',
  syncDescription: 'Sync notes with external services',
  comingSoon: 'Coming soon',
  connected: 'Connected',
  connect: 'Connect',
  connecting: 'Connecting...',
  disconnect: 'Disconnect',
  database: 'Database',
  syncMode: 'Sync mode',
  lastSync: 'Last sync',
  never: 'Never',
  justNow: 'Just now',
  minutesAgo: '{count} min ago',
  hoursAgo: '{count}h ago',
  
  // Sync modes
  syncModeTwoWay: 'Two-way',
  syncModeTwoWayDesc: 'Changes sync both ways',
  syncModeAppToNotion: 'App → Notion',
  syncModeAppToNotionDesc: 'Only push from app to Notion',
  syncModeNotionToApp: 'Notion → App',
  syncModeNotionToAppDesc: 'Only pull from Notion to app',
  selectSyncMode: 'Select sync mode',
  
  // Database picker
  selectDatabase: 'Select database',
  selectDatabaseDescription: 'Choose a Notion database to sync notes with',
  
  // Sync info
  howSyncWorks: 'How sync works',
  proSyncManual: 'Pro plan — manual sync per note',
  proSyncPerNote: 'Tap sync button on each note',
  ultraSyncAuto: 'Automatic background sync',
  ultraSyncBackground: 'All notes sync automatically',
  syncRequiresPaidPlan: 'Sync requires Pro or Ultra plan',
  
  // Sync actions
  syncNote: 'Sync',
  syncing: 'Syncing...',
  synced: 'Synced',
  syncError: 'Sync error',
  syncConflict: 'Conflict',
  openInNotion: 'Open in Notion',
  
  // Conflict resolution
  resolveConflict: 'Resolve conflict',
  keepLocal: 'Keep local version',
  keepExternal: 'Use Notion version',
  keepBoth: 'Keep both versions',
  
  // Errors and permissions
  syncRequiresPro: 'Sync requires Pro plan',
  upgradeForSync: 'Upgrade to Pro for sync',
  upgradeForAutoSync: 'Auto-sync requires Ultra plan',
  upgradeToUnlock: 'Upgrade to unlock',
  connectionFailed: 'Connection failed',
  operationFailed: 'Operation failed',
}

export const translations = {
  ru: translationsRu,
  en: translationsEn,
} as const

export type TranslationKey = keyof typeof translationsRu

interface I18nState {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
}

export const useI18n = create<I18nState>()(
  persist(
    (set, get) => ({
      language: 'ru',
      setLanguage: (lang) => set({ language: lang }),
      t: (key, params) => {
        const { language } = get()
        let text: string = translations[language][key] || translations.ru[key] || key
        
        if (params) {
          Object.entries(params).forEach(([k, v]) => {
            text = text.replace(`{${k}}`, String(v))
          })
        }
        
        return text
      },
    }),
    {
      name: 'fixnote-i18n',
    }
  )
)
