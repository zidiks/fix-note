import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import { useI18n } from '../../i18n'

interface NoteActionBarProps {
  isEditing: boolean
  isSyncing: boolean
  canSync: boolean
  syncStatus?: { synced: boolean; has_integration: boolean } | null
  isSharing: boolean
  onEdit: () => void
  onSave: () => void
  onCancel: () => void
  onSync: () => void
  onShare: () => void
  onCopy: () => void
  onDelete?: () => void
  isSaving: boolean
  keyboardHeight: number
  viewportOffset: number
}

export const NoteActionBar = ({
  isEditing,
  isSyncing,
  canSync,
  syncStatus,
  isSharing,
  onEdit,
  onSave,
  onCancel,
  onSync,
  onShare,
  onCopy,
  onDelete,
  isSaving,
  keyboardHeight,
  viewportOffset,
}: NoteActionBarProps) => {
  const { t } = useI18n()

  return (
    <motion.div
      className="fixed left-0 right-0 z-[100] h-[48px] flex items-center justify-center"
      initial={{ opacity: 0, y: 20 }}
      animate={{
        opacity: 1,
        y: viewportOffset > 0 ? -viewportOffset : 0
      }}
      transition={{
        delay: 0.15,
        duration: 0.25,
        ease: [0.25, 0.46, 0.45, 0.94]
      }}
      style={{
        position: 'fixed',
        bottom: keyboardHeight > 0 
          ? `${keyboardHeight + 12}px` 
          : `calc(12px + env(safe-area-inset-bottom, 0px))`
      }}
    >
      <motion.div
        className="liquid-glass--action-bar relative h-[48px] flex items-center justify-center overflow-hidden"
        animate={{
          width: isEditing ? 104 : 268
        }}
        transition={{
          duration: 0.3,
          ease: [0.4, 0, 0.2, 1]
        }}
      >
        <div className="liquid-glass__frost" />
        <div className="liquid-glass__gradient-border" />
        <div className="liquid-glass__content liquid-glass__content--actions">
          <AnimatePresence mode="wait" initial={false}>
            {isEditing ? (
              <motion.div
                key="edit-actions"
                className="flex items-center justify-center gap-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              >
                <button
                  onClick={onCancel}
                  className="action-bar-button"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
                <button
                  onClick={onSave}
                  disabled={isSaving}
                  className="action-bar-button action-bar-button--accent"
                >
                  {isSaving ? (
                    <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="view-actions"
                className="flex items-center justify-center gap-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              >
                <button
                  onClick={onEdit}
                  className="action-bar-button"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>

                {(
                  <button
                    onClick={onSync}
                    disabled={isSyncing}
                    className={clsx(
                      `action-bar-button transition easy-in-out ${syncStatus?.synced ? 'action-bar-button--synced' : ''}`,
                      { 'pointer-events-none opacity-30': !(canSync && syncStatus?.has_integration) }
                    )}
                    title={t('syncNote')}
                  >
                    {isSyncing ? (
                      <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M23 4V10H17"/>
                        <path d="M1 20V14H7"/>
                        <path d="M3.51 9A9 9 0 0 1 20.49 9L23 11.5"/>
                        <path d="M20.49 15A9 9 0 0 1 3.51 15L1 12.5"/>
                      </svg>
                    )}
                  </button>
                )}

                <button
                  onClick={onShare}
                  disabled={isSharing}
                  className="action-bar-button"
                >
                  {isSharing ? (
                    <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="18" cy="5" r="3" />
                      <circle cx="6" cy="12" r="3" />
                      <circle cx="18" cy="19" r="3" />
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </svg>
                  )}
                </button>

                <button
                  onClick={onCopy}
                  className="action-bar-button"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                </button>

                {onDelete && (
                  <button
                    onClick={onDelete}
                    className="action-bar-button action-bar-button--destructive"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  )
}

