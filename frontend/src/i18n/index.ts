import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Language = 'ru' | 'en'

const translationsRu = {
  // App
  notes: 'Р—Р°РјРµС‚РєРё',
  profile: 'РџСЂРѕС„РёР»СЊ',
  
  // Profile page
  myProfile: 'РњРѕР№ РїСЂРѕС„РёР»СЊ',
  language: 'РЇР·С‹Рє',
  subscription: 'РџРѕРґРїРёСЃРєР°',
  russian: 'Р СѓСЃСЃРєРёР№',
  english: 'English',
  
  // Subscription tiers
  free: 'Free',
  pro: 'Pro',
  ultra: 'Ultra',
  trial: 'Trial',
  trialDaysLeft: 'РџСЂРѕР±РЅС‹Р№ РїРµСЂРёРѕРґ: {days} РґРЅ.',
  currentPlan: 'РўРµРєСѓС‰РёР№ РїР»Р°РЅ',
  upgrade: 'РЈР»СѓС‡С€РёС‚СЊ',
  downgrade: 'РџРѕРЅРёР·РёС‚СЊ',
  subscribePlan: 'РџРѕРґРїРёСЃР°С‚СЊСЃСЏ',
  
  // Features
  features: 'Р’РѕР·РјРѕР¶РЅРѕСЃС‚Рё',
  aiSummary: 'AI-СЃСѓРјРјР°СЂРёР·Р°С†РёСЏ',
  voiceNotes: 'Р“РѕР»РѕСЃРѕРІС‹Рµ Р·Р°РјРµС‚РєРё',
  aiChat: 'AI-С‡Р°С‚ РїРѕ Р·Р°РјРµС‚РєР°Рј',
  syncNotes: 'РЎРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ',
  notionSync: 'Notion',
  obsidianSync: 'Obsidian',
  anytypeSync: 'Anytype',
  
  // Limits
  unlimited: 'Р‘РµР·Р»РёРјРёС‚',
  perMonth: '/РјРµСЃ',
  minutes: 'РјРёРЅ',
  summaries: 'СЃСѓРј.',
  soon: 'РЎРєРѕСЂРѕ',
  
  // Feature descriptions
  noAiFeatures: 'РќРµС‚ AI С„СѓРЅРєС†РёР№',
  basicNotes: 'РўРѕР»СЊРєРѕ С‚РµРєСЃС‚РѕРІС‹Рµ Р·Р°РјРµС‚РєРё',
  summaryLimit: 'РґРѕ {limit} СЃСѓРј./РјРµСЃ',
  voiceLimit: 'РґРѕ {limit} РјРёРЅ/РјРµСЃ',
  basicAiChat: 'Р‘Р°Р·РѕРІС‹Р№ (РјРµРґР»РµРЅРЅС‹Р№)',
  fastAiChat: 'Р‘С‹СЃС‚СЂС‹Р№ + РєРѕРЅС‚РµРєСЃС‚',
  manualSync: 'Р СѓС‡РЅР°СЏ РѕС‚РїСЂР°РІРєР°',
  autoSync: 'РђРІС‚Рѕ-СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ',
  
  // Pricing
  pricing: 'РЎС‚РѕРёРјРѕСЃС‚СЊ',
  monthly: 'Р’ РјРµСЃСЏС†',
  yearly: 'Р’ РіРѕРґ',
  savings: 'Р­РєРѕРЅРѕРјРёСЏ',
  
  // Notes list
  noNotes: 'РќРµС‚ Р·Р°РјРµС‚РѕРє',
  noNotesDesc: 'РћС‚РїСЂР°РІСЊС‚Рµ РіРѕР»РѕСЃРѕРІРѕРµ РёР»Рё С‚РµРєСЃС‚РѕРІРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ Р±РѕС‚Сѓ, С‡С‚РѕР±С‹ СЃРѕР·РґР°С‚СЊ РїРµСЂРІСѓСЋ Р·Р°РјРµС‚РєСѓ',
  searchPlaceholder: 'РџРѕРёСЃРє Р·Р°РјРµС‚РѕРє...',
  searchNoResults: 'РќРёС‡РµРіРѕ РЅРµ РЅР°Р№РґРµРЅРѕ',
  searchNoResultsDesc: 'РџРѕРїСЂРѕР±СѓР№С‚Рµ РёР·РјРµРЅРёС‚СЊ РїРѕРёСЃРєРѕРІС‹Р№ Р·Р°РїСЂРѕСЃ',
  results: 'Р РµР·СѓР»СЊС‚Р°С‚С‹',
  
  // Date groups
  today: 'РЎРµРіРѕРґРЅСЏ',
  yesterday: 'Р’С‡РµСЂР°',
  thisWeek: 'РќР° СЌС‚РѕР№ РЅРµРґРµР»Рµ',
  thisMonth: 'Р’ СЌС‚РѕРј РјРµСЃСЏС†Рµ',
  earlier: 'Р Р°РЅРµРµ',
  
  // Actions
  back: 'РќР°Р·Р°Рґ',
  save: 'РЎРѕС…СЂР°РЅРёС‚СЊ',
  cancel: 'РћС‚РјРµРЅР°',
  delete: 'РЈРґР°Р»РёС‚СЊ',
  share: 'РџРѕРґРµР»РёС‚СЊСЃСЏ',
  edit: 'Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ',
  copy: 'РљРѕРїРёСЂРѕРІР°С‚СЊ',
  done: 'Р“РѕС‚РѕРІРѕ',
  
  // Paywall
  unlockFeature: 'Р Р°Р·Р±Р»РѕРєРёСЂРѕРІР°С‚СЊ С„СѓРЅРєС†РёСЋ',
  featureRequires: 'Р­С‚Р° С„СѓРЅРєС†РёСЏ С‚СЂРµР±СѓРµС‚',
  upgradeToAccess: 'РћР±РЅРѕРІРёС‚Рµ РїРѕРґРїРёСЃРєСѓ РґР»СЏ РґРѕСЃС‚СѓРїР°',
  trialExpired: 'РџСЂРѕР±РЅС‹Р№ РїРµСЂРёРѕРґ РёСЃС‚С‘Рє',
  trialExpiredDesc: 'РћС„РѕСЂРјРёС‚Рµ РїРѕРґРїРёСЃРєСѓ, С‡С‚РѕР±С‹ РїСЂРѕРґРѕР»Р¶РёС‚СЊ РїРѕР»СЊР·РѕРІР°С‚СЊСЃСЏ AI С„СѓРЅРєС†РёСЏРјРё',
  
  // Telegram Stars
  payWithStars: 'РћРїР»Р°С‚РёС‚СЊ в­ђпёЏ Stars',
  starsBalance: 'Р‘Р°Р»Р°РЅСЃ Stars',
  
  // Errors
  error: 'РћС€РёР±РєР°',
  tryAgain: 'РџРѕРїСЂРѕР±СѓР№С‚Рµ СЃРЅРѕРІР°',
  
  // Success messages
  languageChanged: 'РЇР·С‹Рє РёР·РјРµРЅС‘РЅ',
  subscriptionActivated: 'РџРѕРґРїРёСЃРєР° Р°РєС‚РёРІРёСЂРѕРІР°РЅР°!',
  
  // Note detail
  noteCreated: 'РЎРѕР·РґР°РЅРѕ',
  voiceNote: 'Р“РѕР»РѕСЃРѕРІР°СЏ',
  textNote: 'РўРµРєСЃС‚',
  duration: 'Р”Р»РёС‚РµР»СЊРЅРѕСЃС‚СЊ',
  tabAiSummary: 'РЎСѓРјРјР°СЂР°Р№Р·',
  tabFullText: 'РџРѕР»РЅС‹Р№ С‚РµРєСЃС‚',
  noSummary: 'РќРµС‚ СЃСѓРјРјР°СЂР°Р№Р·Р°',
  
  // Misc
  allNotesSync: 'Р’СЃРµ Р·Р°РјРµС‚РєРё СЃРёРЅС…СЂРѕРЅРёР·РёСЂСѓСЋС‚СЃСЏ СЃ СЌС‚РёРј Р°РєРєР°СѓРЅС‚РѕРј',
  version: 'Р’РµСЂСЃРёСЏ',
  
  // Sync settings
  syncSettings: 'РЎРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ',
  syncDescription: 'РЎРёРЅС…СЂРѕРЅРёР·РёСЂСѓР№С‚Рµ Р·Р°РјРµС‚РєРё СЃ РІРЅРµС€РЅРёРјРё СЃРµСЂРІРёСЃР°РјРё',
  comingSoon: 'РЎРєРѕСЂРѕ',
  connected: 'РџРѕРґРєР»СЋС‡РµРЅРѕ',
  connect: 'РџРѕРґРєР»СЋС‡РёС‚СЊ',
  connecting: 'РџРѕРґРєР»СЋС‡РµРЅРёРµ...',
  disconnect: 'РћС‚РєР»СЋС‡РёС‚СЊ',
  database: 'Р‘Р°Р·Р° РґР°РЅРЅС‹С…',
  syncMode: 'Р РµР¶РёРј СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёРё',
  lastSync: 'РџРѕСЃР»РµРґРЅСЏСЏ СЃРёРЅС…СЂ.',
  syncAllNotes: 'РЎРёРЅС…СЂРѕРЅРёР·РёСЂРѕРІР°С‚СЊ РІСЃРµ',
  syncingAll: 'РЎРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ...',
  syncedCount: 'РЎРёРЅС…СЂРѕРЅРёР·РёСЂРѕРІР°РЅРѕ: {count}',
  failedCount: 'РћС€РёР±РѕРє: {count}',
  allUpToDate: 'Р’СЃС‘ СЃРёРЅС…СЂРѕРЅРёР·РёСЂРѕРІР°РЅРѕ',
  never: 'РќРёРєРѕРіРґР°',
  justNow: 'РўРѕР»СЊРєРѕ С‡С‚Рѕ',
  minutesAgo: '{count} РјРёРЅ. РЅР°Р·Р°Рґ',
  hoursAgo: '{count} С‡. РЅР°Р·Р°Рґ',
  
  // Sync modes
  syncModeTwoWay: 'Р”РІСѓСЃС‚РѕСЂРѕРЅРЅСЏСЏ',
  syncModeTwoWayDesc: 'РР·РјРµРЅРµРЅРёСЏ СЃРёРЅС…СЂРѕРЅРёР·РёСЂСѓСЋС‚СЃСЏ РІ РѕР±Рµ СЃС‚РѕСЂРѕРЅС‹',
  syncModeAppToNotion: 'РџСЂРёР»РѕР¶РµРЅРёРµ в†’ Notion',
  syncModeAppToNotionDesc: 'РўРѕР»СЊРєРѕ РѕС‚РїСЂР°РІРєР° РёР· РїСЂРёР»РѕР¶РµРЅРёСЏ РІ Notion',
  syncModeNotionToApp: 'Notion в†’ РџСЂРёР»РѕР¶РµРЅРёРµ',
  syncModeNotionToAppDesc: 'РўРѕР»СЊРєРѕ РїРѕР»СѓС‡РµРЅРёРµ РёР· Notion РІ РїСЂРёР»РѕР¶РµРЅРёРµ',
  selectSyncMode: 'Р’С‹Р±РµСЂРёС‚Рµ СЂРµР¶РёРј СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёРё',
  
  // Database picker
  selectDatabase: 'Р’С‹Р±РµСЂРёС‚Рµ Р±Р°Р·Сѓ РґР°РЅРЅС‹С…',
  selectDatabaseDescription: 'Р’С‹Р±РµСЂРёС‚Рµ Р±Р°Р·Сѓ РґР°РЅРЅС‹С… Notion РґР»СЏ СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёРё Р·Р°РјРµС‚РѕРє',
  
  // Sync info
  howSyncWorks: 'РљР°Рє СЂР°Р±РѕС‚Р°РµС‚ СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ',
  proSyncManual: 'РќР° Pro РїР»Р°РЅРµ вЂ” СЂСѓС‡РЅР°СЏ СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ',
  proSyncPerNote: 'РќР°Р¶РјРёС‚Рµ РєРЅРѕРїРєСѓ СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёРё РЅР° РєР°Р¶РґРѕР№ Р·Р°РјРµС‚РєРµ',
  ultraSyncAuto: 'РђРІС‚РѕРјР°С‚РёС‡РµСЃРєР°СЏ СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ РІ С„РѕРЅРµ',
  ultraSyncBackground: 'Р’СЃРµ Р·Р°РјРµС‚РєРё СЃРёРЅС…СЂРѕРЅРёР·РёСЂСѓСЋС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё',
  syncRequiresPaidPlan: 'РЎРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ РґРѕСЃС‚СѓРїРЅР° РЅР° Pro Рё Ultra РїР»Р°РЅР°С…',
  
  // Sync actions
  syncNote: 'РЎРёРЅС…СЂРѕРЅРёР·РёСЂРѕРІР°С‚СЊ',
  syncing: 'РЎРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ...',
  synced: 'РЎРёРЅС…СЂРѕРЅРёР·РёСЂРѕРІР°РЅРѕ',
  syncError: 'РћС€РёР±РєР° СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёРё',
  syncSuccess: 'РЎРёРЅС…СЂРѕРЅРёР·РёСЂРѕРІР°РЅРѕ СЃ Notion',
  syncSkipped: 'РЈР¶Рµ СЃРёРЅС…СЂРѕРЅРёР·РёСЂРѕРІР°РЅРѕ',
  syncConflict: 'РљРѕРЅС„Р»РёРєС‚',
  openInNotion: 'РћС‚РєСЂС‹С‚СЊ РІ Notion',
  
  // Conflict resolution
  resolveConflict: 'Р Р°Р·СЂРµС€РёС‚СЊ РєРѕРЅС„Р»РёРєС‚',
  keepLocal: 'РћСЃС‚Р°РІРёС‚СЊ Р»РѕРєР°Р»СЊРЅСѓСЋ РІРµСЂСЃРёСЋ',
  keepExternal: 'Р’Р·СЏС‚СЊ РІРµСЂСЃРёСЋ РёР· Notion',
  keepBoth: 'РЎРѕС…СЂР°РЅРёС‚СЊ РѕР±Рµ РІРµСЂСЃРёРё',
  
  // Errors and permissions
  syncRequiresPro: 'Р”Р»СЏ СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёРё РЅСѓР¶РµРЅ Pro РїР»Р°РЅ',
  upgradeForSync: 'РћР±РЅРѕРІРёС‚Рµ РґРѕ Pro РґР»СЏ СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёРё',
  upgradeForAutoSync: 'РђРІС‚Рѕ-СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ РґРѕСЃС‚СѓРїРЅР° РЅР° Ultra РїР»Р°РЅРµ',
  upgradeToUnlock: 'РћР±РЅРѕРІРёС‚Рµ РїРѕРґРїРёСЃРєСѓ РґР»СЏ РґРѕСЃС‚СѓРїР°',
  connectionFailed: 'РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕРґРєР»СЋС‡РёС‚СЊСЃСЏ',
  operationFailed: 'РћРїРµСЂР°С†РёСЏ РЅРµ РІС‹РїРѕР»РЅРµРЅР°',
}

const translationsEn: typeof translationsRu = {
  // App
  notes: 'Notes',
  profile: 'Profile',
  
  // Profile page
  myProfile: 'My Profile',
  language: 'Language',
  subscription: 'Subscription',
  russian: 'Р СѓСЃСЃРєРёР№',
  english: 'English',
  
  // Subscription tiers
  free: 'Free',
  pro: 'Pro',
  ultra: 'Ultra',
  trial: 'Trial',
  trialDaysLeft: 'Trial: {days} days left',
  currentPlan: 'Current Plan',
  upgrade: 'Upgrade',
  downgrade: 'Downgrade',
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
  payWithStars: 'Pay with в­ђпёЏ Stars',
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
  tabAiSummary: 'AI Summary',
  tabFullText: 'Full Text',
  noSummary: 'No summary',
  
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
  syncAllNotes: 'Sync all notes',
  syncingAll: 'Syncing...',
  syncedCount: 'Synced: {count}',
  failedCount: 'Failed: {count}',
  allUpToDate: 'All up to date',
  never: 'Never',
  justNow: 'Just now',
  minutesAgo: '{count} min ago',
  hoursAgo: '{count}h ago',
  
  // Sync modes
  syncModeTwoWay: 'Two-way',
  syncModeTwoWayDesc: 'Changes sync both ways',
  syncModeAppToNotion: 'App в†’ Notion',
  syncModeAppToNotionDesc: 'Only push from app to Notion',
  syncModeNotionToApp: 'Notion в†’ App',
  syncModeNotionToAppDesc: 'Only pull from Notion to app',
  selectSyncMode: 'Select sync mode',
  
  // Database picker
  selectDatabase: 'Select database',
  selectDatabaseDescription: 'Choose a Notion database to sync notes with',
  
  // Sync info
  howSyncWorks: 'How sync works',
  proSyncManual: 'Pro plan вЂ” manual sync per note',
  proSyncPerNote: 'Tap sync button on each note',
  ultraSyncAuto: 'Automatic background sync',
  ultraSyncBackground: 'All notes sync automatically',
  syncRequiresPaidPlan: 'Sync requires Pro or Ultra plan',
  
  // Sync actions
  syncNote: 'Sync',
  syncing: 'Syncing...',
  synced: 'Synced',
  syncError: 'Sync error',
  syncSuccess: 'Synced with Notion',
  syncSkipped: 'Already synced',
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

