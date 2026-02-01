import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useI18n } from '../i18n'
import { useTelegram } from '../hooks/useTelegram'
import { useSubscription } from '../stores/subscription'
import { api, IntegrationConnection, AvailableProvider, SyncMode, NotionDatabase } from '../api/client'

interface SyncSettingsPageProps {
  onBack?: () => void
}

// Sync mode options with labels
const SYNC_MODES: { value: SyncMode; labelKey: string; icon: string }[] = [
  { value: 'two_way', labelKey: 'syncModeTwoWay', icon: '↔️' },
  { value: 'app_to_external', labelKey: 'syncModeAppToNotion', icon: '➡️' },
  { value: 'external_to_app', labelKey: 'syncModeNotionToApp', icon: '⬅️' },
]

export const SyncSettingsPage = ({ onBack: _onBack }: SyncSettingsPageProps) => {
  void _onBack // handled by Telegram BackButton
  
  const { t } = useI18n()
  const { hapticImpact, showAlert, openLink } = useTelegram()
  const { subscription } = useSubscription()
  
  // State
  const [integrations, setIntegrations] = useState<IntegrationConnection[]>([])
  const [availableProviders, setAvailableProviders] = useState<AvailableProvider[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isConnecting, setIsConnecting] = useState(false)
  const [showDatabasePicker, setShowDatabasePicker] = useState(false)
  const [availableDatabases, setAvailableDatabases] = useState<NotionDatabase[]>([])
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationConnection | null>(null)
  const [showSyncModeModal, setShowSyncModeModal] = useState(false)
  
  // Permission checks
  const canSync = subscription?.limits.sync_enabled ?? false
  const canAutoSync = subscription?.limits.auto_sync ?? false
  const plan = subscription?.plan ?? 'free'
  
  // Load integrations
  const loadIntegrations = useCallback(async () => {
    try {
      setIsLoading(true)
      const data = await api.getIntegrations()
      setIntegrations(data.integrations)
      setAvailableProviders(data.available_providers)
    } catch (error) {
      console.error('Failed to load integrations:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])
  
  useEffect(() => {
    loadIntegrations()
  }, [loadIntegrations])
  
  // Handle OAuth callback from URL or localStorage
  useEffect(() => {
    // First check URL params (direct redirect)
    const params = new URLSearchParams(window.location.search)
    let code = params.get('code')
    let state = params.get('state')
    
    // If not in URL, check localStorage (from OAuth redirect page)
    if (!code) {
      try {
        code = localStorage.getItem('notion_oauth_code')
        state = localStorage.getItem('notion_oauth_state') || ''
        
        // Clear stored values
        if (code) {
          localStorage.removeItem('notion_oauth_code')
          localStorage.removeItem('notion_oauth_state')
        }
      } catch (e) {
        // localStorage not available
      }
    }
    
    if (code) {
      handleNotionCallback(code, state || '')
      // Clean up URL if it was in params
      if (params.get('code')) {
        window.history.replaceState({}, '', window.location.pathname)
      }
    }
  }, [])
  
  // Connect to Notion
  const handleConnectNotion = async () => {
    if (!canSync) {
      hapticImpact('error')
      showAlert(t('upgradeForSync'))
      return
    }
    
    hapticImpact('light')
    setIsConnecting(true)
    
    try {
      const { authorization_url } = await api.startNotionOAuth()
      // Open in system browser or new tab
      openLink(authorization_url)
    } catch (error) {
      console.error('Failed to start OAuth:', error)
      showAlert(t('connectionFailed'))
    } finally {
      setIsConnecting(false)
    }
  }
  
  // Handle OAuth callback
  const handleNotionCallback = async (code: string, state: string) => {
    setIsConnecting(true)
    
    try {
      const result = await api.completeNotionOAuth(code, state)
      
      if (result.success) {
        hapticImpact('success')
        
        if (!result.has_database && result.available_databases) {
          // Show database picker
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
  }
  
  // Select Notion database
  const handleSelectDatabase = async (database: NotionDatabase) => {
    hapticImpact('light')
    
    try {
      await api.setNotionDatabase(database.id)
      setShowDatabasePicker(false)
      await loadIntegrations()
      hapticImpact('success')
    } catch (error) {
      console.error('Failed to set database:', error)
      showAlert(t('operationFailed'))
    }
  }
  
  // Update sync mode
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
  
  // Toggle auto-sync
  const handleAutoSyncToggle = async (integration: IntegrationConnection) => {
    if (!canAutoSync) {
      hapticImpact('error')
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
  
  // Disconnect integration
  const handleDisconnect = async (integration: IntegrationConnection) => {
    hapticImpact('medium')
    
    // Telegram WebApp doesn't have confirm, use showConfirm or just proceed
    try {
      await api.disconnectIntegration(integration.provider)
      hapticImpact('success')
      await loadIntegrations()
    } catch (error) {
      console.error('Failed to disconnect:', error)
      showAlert(t('operationFailed'))
    }
  }
  
  // Get connected integration for a provider
  const getIntegration = (provider: string) => {
    return integrations.find(i => i.provider === provider && i.is_active)
  }
  
  // Format last sync time
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
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 50 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="min-h-screen pb-8"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h1 
          className="text-2xl font-bold"
          style={{ color: 'var(--text-primary)' }}
        >
          {t('syncSettings')}
        </h1>
        <p 
          className="text-sm mt-1"
          style={{ color: 'var(--text-secondary)' }}
        >
          {t('syncDescription')}
        </p>
      </div>
      
      {/* Subscription notice */}
      {!canSync && (
        <div className="px-4 mb-4">
          <div 
            className="rounded-xl p-4"
            style={{ 
              background: 'linear-gradient(135deg, rgba(255, 149, 0, 0.15) 0%, rgba(255, 107, 0, 0.15) 100%)',
              border: '1px solid rgba(255, 149, 0, 0.3)'
            }}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔒</span>
              <div>
                <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  {t('syncRequiresPro')}
                </p>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {t('upgradeToUnlock')}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Loading state */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div 
            className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
          />
        </div>
      ) : (
        <div className="px-4 space-y-4">
          {/* Connected Integrations */}
          {availableProviders.map(provider => {
            const integration = getIntegration(provider.provider)
            const isConnected = !!integration
            
            return (
              <div
                key={provider.provider}
                className="rounded-2xl overflow-hidden"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                {/* Provider header */}
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                      style={{ 
                        background: provider.provider === 'notion' 
                          ? 'linear-gradient(135deg, #000000 0%, #2d2d2d 100%)'
                          : provider.provider === 'obsidian'
                          ? 'linear-gradient(135deg, #7C3AED 0%, #A855F7 100%)'
                          : 'linear-gradient(135deg, #F97316 0%, #FB923C 100%)'
                      }}
                    >
                      {provider.icon}
                    </div>
                    <div>
                      <h3 
                        className="font-semibold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {provider.name}
                      </h3>
                      {provider.coming_soon ? (
                        <span 
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{ 
                            backgroundColor: 'rgba(139, 92, 246, 0.2)',
                            color: '#A855F7'
                          }}
                        >
                          {t('comingSoon')}
                        </span>
                      ) : isConnected ? (
                        <p 
                          className="text-sm"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {integration.workspace_name || integration.database_name || t('connected')}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  
                  {/* Connect/Status button */}
                  {provider.available && !provider.coming_soon && (
                    isConnected ? (
                      <div 
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                        style={{ backgroundColor: 'rgba(52, 199, 89, 0.15)' }}
                      >
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-sm text-green-500 font-medium">
                          {t('connected')}
                        </span>
                      </div>
                    ) : (
                      <button
                        onClick={handleConnectNotion}
                        disabled={isConnecting || !canSync}
                        className="px-4 py-2 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50"
                        style={{ 
                          background: 'var(--accent)',
                          color: 'white'
                        }}
                      >
                        {isConnecting ? t('connecting') : t('connect')}
                      </button>
                    )
                  )}
                </div>
                
                {/* Integration settings (if connected) */}
                {isConnected && integration && (
                  <>
                    <div 
                      className="mx-4"
                      style={{ height: '1px', backgroundColor: 'var(--separator)' }}
                    />
                    
                    {/* Database info */}
                    {integration.database_name && (
                      <div className="px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span style={{ color: 'var(--text-secondary)' }}>📁</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{t('database')}</span>
                        </div>
                        <span 
                          className="text-sm font-medium"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {integration.database_name}
                        </span>
                      </div>
                    )}
                    
                    {/* Sync mode selector */}
                    <button
                      onClick={() => {
                        hapticImpact('light')
                        setSelectedIntegration(integration)
                        setShowSyncModeModal(true)
                      }}
                      className="w-full px-4 py-3 flex items-center justify-between active:opacity-70"
                    >
                      <div className="flex items-center gap-2">
                        <span style={{ color: 'var(--text-secondary)' }}>🔄</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{t('syncMode')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span 
                          className="text-sm"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {SYNC_MODES.find(m => m.value === integration.sync_mode)?.icon}{' '}
                          {t(SYNC_MODES.find(m => m.value === integration.sync_mode)?.labelKey || 'syncModeTwoWay')}
                        </span>
                        <svg 
                          width="8" height="14" viewBox="0 0 8 14" 
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          <path d="M1 1L7 7L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </div>
                    </button>
                    
                    {/* Auto-sync toggle */}
                    <div className="px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span style={{ color: 'var(--text-secondary)' }}>⚡</span>
                        <div>
                          <span style={{ color: 'var(--text-secondary)' }}>{t('autoSync')}</span>
                          {!canAutoSync && (
                            <span 
                              className="ml-2 text-xs px-1.5 py-0.5 rounded"
                              style={{ 
                                backgroundColor: 'rgba(175, 82, 222, 0.2)',
                                color: '#AF52DE'
                              }}
                            >
                              Ultra
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleAutoSyncToggle(integration)}
                        className={`relative w-12 h-7 rounded-full transition-colors ${
                          integration.auto_sync_enabled ? 'bg-green-500' : ''
                        }`}
                        style={{ 
                          backgroundColor: integration.auto_sync_enabled ? '#34C759' : 'var(--bg-tertiary)'
                        }}
                      >
                        <span 
                          className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform shadow-sm ${
                            integration.auto_sync_enabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                    
                    {/* Last sync info */}
                    <div className="px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span style={{ color: 'var(--text-secondary)' }}>🕐</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{t('lastSync')}</span>
                      </div>
                      <span 
                        className="text-sm"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        {formatLastSync(integration.last_sync_at)}
                      </span>
                    </div>
                    
                    {/* Disconnect button */}
                    <div className="px-4 py-3">
                      <button
                        onClick={() => handleDisconnect(integration)}
                        className="w-full py-2.5 rounded-xl text-red-500 font-medium transition-all active:scale-95"
                        style={{ backgroundColor: 'rgba(255, 59, 48, 0.1)' }}
                      >
                        {t('disconnect')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
          
          {/* Sync info based on plan */}
          <div 
            className="rounded-xl p-4 mt-6"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
          >
            <h4 
              className="font-medium mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              {t('howSyncWorks')}
            </h4>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              {plan === 'pro' ? (
                <>
                  <li className="flex items-start gap-2">
                    <span>•</span>
                    <span>{t('proSyncManual')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>•</span>
                    <span>{t('proSyncPerNote')}</span>
                  </li>
                </>
              ) : plan === 'ultra' ? (
                <>
                  <li className="flex items-start gap-2">
                    <span>✓</span>
                    <span>{t('ultraSyncAuto')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span>✓</span>
                    <span>{t('ultraSyncBackground')}</span>
                  </li>
                </>
              ) : (
                <li className="flex items-start gap-2">
                  <span>🔒</span>
                  <span>{t('syncRequiresPaidPlan')}</span>
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
      
      {/* Database picker modal */}
      <AnimatePresence>
        {showDatabasePicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-end justify-center z-50"
            onClick={() => setShowDatabasePicker(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="w-full max-w-lg rounded-t-3xl p-6"
              style={{ backgroundColor: 'var(--bg-secondary)' }}
              onClick={e => e.stopPropagation()}
            >
              <h3 
                className="text-xl font-bold mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                {t('selectDatabase')}
              </h3>
              <p 
                className="text-sm mb-4"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('selectDatabaseDescription')}
              </p>
              
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {availableDatabases.map(db => (
                  <button
                    key={db.id}
                    onClick={() => handleSelectDatabase(db)}
                    className="w-full p-4 rounded-xl flex items-center gap-3 transition-all active:scale-98"
                    style={{ backgroundColor: 'var(--bg-tertiary)' }}
                  >
                    <span className="text-xl">📁</span>
                    <span 
                      className="font-medium text-left flex-1"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {db.name}
                    </span>
                    <svg 
                      width="8" height="14" viewBox="0 0 8 14" 
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      <path d="M1 1L7 7L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </button>
                ))}
              </div>
              
              <button
                onClick={() => setShowDatabasePicker(false)}
                className="w-full mt-4 py-3 rounded-xl font-medium"
                style={{ 
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-secondary)'
                }}
              >
                {t('cancel')}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Sync mode picker modal */}
      <AnimatePresence>
        {showSyncModeModal && selectedIntegration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-end justify-center z-50"
            onClick={() => setShowSyncModeModal(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="w-full max-w-lg rounded-t-3xl p-6"
              style={{ backgroundColor: 'var(--bg-secondary)' }}
              onClick={e => e.stopPropagation()}
            >
              <h3 
                className="text-xl font-bold mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                {t('selectSyncMode')}
              </h3>
              
              <div className="space-y-2">
                {SYNC_MODES.map(mode => (
                  <button
                    key={mode.value}
                    onClick={() => handleSyncModeChange(mode.value)}
                    className={`w-full p-4 rounded-xl flex items-center gap-3 transition-all active:scale-98 ${
                      selectedIntegration.sync_mode === mode.value ? 'ring-2 ring-offset-2' : ''
                    }`}
                    style={{ 
                      backgroundColor: 'var(--bg-tertiary)',
                      ringColor: 'var(--accent)'
                    }}
                  >
                    <span className="text-xl">{mode.icon}</span>
                    <div className="text-left flex-1">
                      <span 
                        className="font-medium block"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {t(mode.labelKey)}
                      </span>
                      <span 
                        className="text-sm"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {t(`${mode.labelKey}Desc`)}
                      </span>
                    </div>
                    {selectedIntegration.sync_mode === mode.value && (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="var(--accent)">
                        <path d="M10 0C4.48 0 0 4.48 0 10s4.48 10 10 10 10-4.48 10-10S15.52 0 10 0zm-2 15l-5-5 1.41-1.41L8 12.17l7.59-7.59L17 6l-9 9z"/>
                      </svg>
                    )}
                  </button>
                ))}
              </div>
              
              <button
                onClick={() => setShowSyncModeModal(false)}
                className="w-full mt-4 py-3 rounded-xl font-medium"
                style={{ 
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-secondary)'
                }}
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

