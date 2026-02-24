import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useI18n } from '../i18n'
import { useTelegram } from '../hooks/useTelegram'
import { useSubscription } from '../stores/subscription'
import { api, IntegrationConnection, AvailableProvider, SyncMode, NotionDatabase } from '../api/client'

interface SyncSettingsPageProps {
  onBack?: () => void
}

const SYNC_MODES: { value: SyncMode; labelKey: string }[] = [
  { value: 'two_way', labelKey: 'syncModeTwoWay' },
  { value: 'app_to_external', labelKey: 'syncModeAppToNotion' },
  { value: 'external_to_app', labelKey: 'syncModeNotionToApp' },
]

const ArrowRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18l6-6-6-6" />
  </svg>
)

export const SyncSettingsPage = ({ onBack: _onBack }: SyncSettingsPageProps) => {
  void _onBack

  const { t } = useI18n()
  const { hapticImpact, hapticNotification, showAlert, openLink } = useTelegram()
  const { subscription } = useSubscription()

  const [integrations, setIntegrations] = useState<IntegrationConnection[]>([])
  const [availableProviders, setAvailableProviders] = useState<AvailableProvider[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isConnecting, setIsConnecting] = useState(false)
  const [showDatabasePicker, setShowDatabasePicker] = useState(false)
  const [availableDatabases, setAvailableDatabases] = useState<NotionDatabase[]>([])
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationConnection | null>(null)
  const [showSyncModeModal, setShowSyncModeModal] = useState(false)
  const [isSyncingAll, setIsSyncingAll] = useState(false)
  const [syncAllResult, setSyncAllResult] = useState<{ synced: number; failed: number } | null>(null)

  const canSync = subscription?.limits.sync_enabled ?? false
  const canAutoSync = subscription?.limits.auto_sync ?? false
  const plan = subscription?.plan ?? 'free'

  const loadIntegrations = useCallback(async () => {
    try {
      setIsLoading(true)
      const data = await api.getIntegrations()
      setIntegrations(data.integrations)
      setAvailableProviders(data.available_providers)

      const notionIntegration = data.integrations.find(i => i.provider === 'notion' && i.is_active)
      if (notionIntegration && !notionIntegration.database_id && !showDatabasePicker) {
        setSelectedIntegration(notionIntegration)
        const notionProvider = data.available_providers.find(p => p.provider === 'notion')
        if (notionProvider?.databases) {
          setAvailableDatabases(notionProvider.databases)
          setShowDatabasePicker(true)
        }
      }
    } catch (error) {
      console.error('Failed to load integrations:', error)
    } finally {
      setIsLoading(false)
    }
  }, [showDatabasePicker])

  useEffect(() => {
    loadIntegrations()
  }, [loadIntegrations])

  const handleNotionCallback = useCallback(async (code: string, state: string) => {
    setIsConnecting(true)
    try {
      const result = await api.completeNotionOAuth(code, state)
      if (result.success) {
        hapticNotification('success')
        if (!result.has_database && result.available_databases) {
          setAvailableDatabases(result.available_databases)
          setShowDatabasePicker(true)
        }
        await loadIntegrations()
      } else {
        showAlert(t('connectionFailed'))
      }
    } catch (error) {
      console.error('OAuth callback failed:', error)
      showAlert(t('connectionFailed'))
    } finally {
      setIsConnecting(false)
    }
  }, [hapticNotification, showAlert, t, loadIntegrations])

  const isProcessingOAuthRef = useRef(false)

  const checkPendingOAuth = useCallback(async () => {
    if (isProcessingOAuthRef.current || isConnecting) return
    try {
      isProcessingOAuthRef.current = true
      const result = await api.checkPendingNotionOAuth()
      if (result.pending && result.code) {
        await handleNotionCallback(result.code, '')
        await api.clearPendingNotionOAuth()
      }
    } catch (error) {
      console.error('Failed to check pending OAuth:', error)
    } finally {
      isProcessingOAuthRef.current = false
    }
  }, [handleNotionCallback, isConnecting])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    let code = params.get('code')
    let state = params.get('state')

    if (!code) {
      try {
        code = localStorage.getItem('notion_oauth_code')
        state = localStorage.getItem('notion_oauth_state') || ''
        if (code) {
          localStorage.removeItem('notion_oauth_code')
          localStorage.removeItem('notion_oauth_state')
        }
      } catch {
        // noop
      }
    }

    if (code) {
      handleNotionCallback(code, state || '')
      if (params.get('code')) {
        window.history.replaceState({}, '', window.location.pathname)
      }
    } else {
      checkPendingOAuth()
    }
  }, [checkPendingOAuth, handleNotionCallback])

  useEffect(() => {
    const handleFocus = () => {
      checkPendingOAuth()
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkPendingOAuth()
      }
    }
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [checkPendingOAuth])

  const handleConnectNotion = async () => {
    if (!canSync) {
      hapticNotification('error')
      showAlert(t('upgradeForSync'))
      return
    }
    hapticImpact('light')
    setIsConnecting(true)
    try {
      const { authorization_url } = await api.startNotionOAuth()
      openLink(authorization_url)
    } catch (error) {
      console.error('Failed to start OAuth:', error)
      showAlert(t('connectionFailed'))
    } finally {
      setIsConnecting(false)
    }
  }

  const handleSelectDatabase = async (database: NotionDatabase) => {
    hapticImpact('light')
    try {
      await api.setNotionDatabase(database.id)
      setShowDatabasePicker(false)
      await loadIntegrations()
      hapticNotification('success')
    } catch (error) {
      console.error('Failed to set database:', error)
      showAlert(t('operationFailed'))
    }
  }

  const handleSyncModeChange = async (mode: SyncMode) => {
    if (!selectedIntegration) return
    hapticImpact('light')
    try {
      await api.updateSyncSettings(selectedIntegration.provider, { sync_mode: mode })
      setShowSyncModeModal(false)
      await loadIntegrations()
    } catch (error) {
      console.error('Failed to update sync mode:', error)
      showAlert(t('operationFailed'))
    }
  }

  const handleAutoSyncToggle = async (integration: IntegrationConnection) => {
    if (!canAutoSync) {
      hapticNotification('error')
      showAlert(t('upgradeForAutoSync'))
      return
    }
    hapticImpact('light')
    try {
      await api.updateSyncSettings(integration.provider, {
        auto_sync_enabled: !integration.auto_sync_enabled,
      })
      await loadIntegrations()
    } catch (error) {
      console.error('Failed to toggle auto-sync:', error)
      showAlert(t('operationFailed'))
    }
  }

  const handleDisconnect = async (integration: IntegrationConnection) => {
    hapticImpact('medium')
    try {
      await api.disconnectIntegration(integration.provider)
      hapticNotification('success')
      await loadIntegrations()
    } catch (error) {
      console.error('Failed to disconnect:', error)
      showAlert(t('operationFailed'))
    }
  }

  const handleSyncAll = async () => {
    if (isSyncingAll) return
    hapticImpact('medium')
    setIsSyncingAll(true)
    setSyncAllResult(null)
    try {
      const result = await api.syncAllNotes()
      if (result.synced > 0 || result.failed === 0) {
        hapticNotification('success')
      } else {
        hapticNotification('error')
      }
      setSyncAllResult({ synced: result.synced, failed: result.failed })
      await loadIntegrations()
      setTimeout(() => setSyncAllResult(null), 5000)
    } catch (error) {
      console.error('Failed to sync all notes:', error)
      hapticNotification('error')
      showAlert(t('syncError'))
    } finally {
      setIsSyncingAll(false)
    }
  }

  const getIntegration = (provider: string) => integrations.find(i => i.provider === provider && i.is_active)

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return t('never')
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    if (diff < 60000) return t('justNow')
    if (diff < 3600000) return t('minutesAgo', { count: Math.floor(diff / 60000) })
    if (diff < 86400000) return t('hoursAgo', { count: Math.floor(diff / 3600000) })
    return date.toLocaleDateString()
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.2 }}
      className="min-h-screen pb-8"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="px-4 pt-4 pb-3">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{t('syncSettings')}</h1>
        <p className="text-sm mt-1 text-[var(--text-secondary)]">{t('syncDescription')}</p>
      </div>

      {!canSync && (
        <div className="px-4 mb-4">
          <div className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--separator)' }}>
            <p className="text-sm font-medium text-[var(--text-primary)]">{t('syncRequiresPro')}</p>
            <p className="text-sm mt-1 text-[var(--text-secondary)]">{t('upgradeToUnlock')}</p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--text-secondary)', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="px-4 space-y-3">
          {availableProviders.map((provider) => {
            const integration = getIntegration(provider.provider)
            const isConnected = !!integration
            const providerLabel = provider.name?.slice(0, 1).toUpperCase() || '?'

            return (
              <div
                key={provider.provider}
                className="rounded-2xl border overflow-hidden"
                style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--separator)' }}
              >
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-semibold" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                      {providerLabel}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[var(--text-primary)]">{provider.name}</div>
                      {provider.coming_soon ? (
                        <div className="text-xs text-[var(--text-secondary)]">{t('comingSoon')}</div>
                      ) : isConnected ? (
                        <div className="text-xs text-[var(--text-secondary)] truncate">
                          {integration.workspace_name || integration.database_name || t('connected')}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {provider.available && !provider.coming_soon && (
                    isConnected ? (
                      <span className="text-xs px-2 py-1 rounded-full border text-[var(--text-secondary)]" style={{ borderColor: 'var(--separator)' }}>
                        {t('connected')}
                      </span>
                    ) : (
                      <button
                        onClick={handleConnectNotion}
                        disabled={isConnecting || !canSync}
                        className="h-9 px-4 rounded-xl text-sm border"
                        style={{ borderColor: 'var(--separator)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-primary)' }}
                      >
                        {isConnecting ? t('connecting') : t('connect')}
                      </button>
                    )
                  )}
                </div>

                {isConnected && integration && (
                  <div className="border-t px-4 py-3 space-y-3" style={{ borderColor: 'var(--separator)' }}>
                    {integration.database_name && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-[var(--text-secondary)]">{t('database')}</span>
                        <span className="text-sm text-[var(--text-primary)] truncate">{integration.database_name}</span>
                      </div>
                    )}

                    <button
                      onClick={() => {
                        hapticImpact('light')
                        setSelectedIntegration(integration)
                        setShowSyncModeModal(true)
                      }}
                      className="w-full h-10 px-3 rounded-xl border flex items-center justify-between"
                      style={{ borderColor: 'var(--separator)', backgroundColor: 'var(--bg-primary)' }}
                    >
                      <span className="text-sm text-[var(--text-secondary)]">{t('syncMode')}</span>
                      <span className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                        {t((SYNC_MODES.find(m => m.value === integration.sync_mode)?.labelKey || 'syncModeTwoWay') as any)}
                        <ArrowRight />
                      </span>
                    </button>

                    <div className="flex items-center justify-between">
                      <div className="text-sm text-[var(--text-secondary)]">
                        {t('autoSync')}
                        {!canAutoSync && <span className="ml-2 text-xs">Ultra</span>}
                      </div>
                      <button
                        onClick={() => handleAutoSyncToggle(integration)}
                        className="relative w-12 h-7 rounded-full"
                        style={{ backgroundColor: integration.auto_sync_enabled ? 'var(--text-primary)' : 'var(--separator)' }}
                      >
                        <span
                          className="absolute top-1 w-5 h-5 rounded-full bg-white transition-transform"
                          style={{ transform: integration.auto_sync_enabled ? 'translateX(24px)' : 'translateX(4px)' }}
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[var(--text-secondary)]">{t('lastSync')}</span>
                      <span className="text-sm text-[var(--text-secondary)]">{formatLastSync(integration.last_sync_at)}</span>
                    </div>

                    {integration.database_id && (
                      <div>
                        <button
                          onClick={handleSyncAll}
                          disabled={isSyncingAll}
                          className="w-full h-10 rounded-xl border text-sm"
                          style={{ borderColor: 'var(--separator)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                        >
                          {isSyncingAll ? t('syncingAll') : t('syncAllNotes')}
                        </button>
                        <AnimatePresence>
                          {syncAllResult && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="text-xs mt-2 text-[var(--text-secondary)]"
                            >
                              {syncAllResult.synced > 0 && <span>{t('syncedCount', { count: syncAllResult.synced } as any)}</span>}
                              {syncAllResult.failed > 0 && <span className="ml-2">{t('failedCount', { count: syncAllResult.failed } as any)}</span>}
                              {syncAllResult.synced === 0 && syncAllResult.failed === 0 && <span>{t('allUpToDate')}</span>}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                    <button
                      onClick={() => handleDisconnect(integration)}
                      className="w-full h-10 rounded-xl border text-sm"
                      style={{ borderColor: 'var(--separator)', color: 'var(--destructive)', backgroundColor: 'var(--bg-primary)' }}
                    >
                      {t('disconnect')}
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          <div className="rounded-2xl border p-4 mt-4" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--separator)' }}>
            <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2">{t('howSyncWorks')}</h4>
            <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
              {plan === 'pro' ? (
                <>
                  <li>• {t('proSyncManual')}</li>
                  <li>• {t('proSyncPerNote')}</li>
                </>
              ) : plan === 'ultra' ? (
                <>
                  <li>• {t('ultraSyncAuto')}</li>
                  <li>• {t('ultraSyncBackground')}</li>
                </>
              ) : (
                <li>• {t('syncRequiresPaidPlan')}</li>
              )}
            </ul>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showDatabasePicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/35 flex items-end p-3 z-50"
            onClick={() => setShowDatabasePicker(false)}
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 260 }}
              className="w-full rounded-2xl p-4"
              style={{ backgroundColor: 'var(--bg-secondary)' }}
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-base font-semibold text-[var(--text-primary)]">{t('selectDatabase')}</h3>
              <p className="text-sm mt-1 text-[var(--text-secondary)]">{t('selectDatabaseDescription')}</p>
              <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                {availableDatabases.map(db => (
                  <button
                    key={db.id}
                    onClick={() => handleSelectDatabase(db)}
                    className="w-full h-11 px-3 rounded-xl border text-left text-sm"
                    style={{ borderColor: 'var(--separator)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  >
                    {db.name}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowDatabasePicker(false)}
                className="w-full h-10 mt-3 rounded-xl border text-sm"
                style={{ borderColor: 'var(--separator)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-primary)' }}
              >
                {t('cancel')}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSyncModeModal && selectedIntegration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/35 flex items-end p-3 z-50"
            onClick={() => setShowSyncModeModal(false)}
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 260 }}
              className="w-full rounded-2xl p-4"
              style={{ backgroundColor: 'var(--bg-secondary)' }}
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-base font-semibold text-[var(--text-primary)]">{t('selectSyncMode')}</h3>
              <div className="mt-3 space-y-2">
                {SYNC_MODES.map(mode => {
                  const active = selectedIntegration.sync_mode === mode.value
                  return (
                    <button
                      key={mode.value}
                      onClick={() => handleSyncModeChange(mode.value)}
                      className="w-full px-3 py-3 rounded-xl border text-left"
                      style={{
                        borderColor: active ? 'var(--text-primary)' : 'var(--separator)',
                        backgroundColor: 'var(--bg-primary)',
                      }}
                    >
                      <div className="text-sm font-medium text-[var(--text-primary)]">{t(mode.labelKey as any)}</div>
                      <div className="text-xs mt-1 text-[var(--text-secondary)]">{t(`${mode.labelKey}Desc` as any)}</div>
                    </button>
                  )
                })}
              </div>
              <button
                onClick={() => setShowSyncModeModal(false)}
                className="w-full h-10 mt-3 rounded-xl border text-sm"
                style={{ borderColor: 'var(--separator)', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-primary)' }}
              >
                {t('cancel')}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
