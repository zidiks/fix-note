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
                  onClick={onShare}
                  disabled={isSharing}
                  className="action-bar-button"
                >
                  {isSharing ? (
                    <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: 'var(--text-primary)' }}>
                      <path d="M13 11L22 2M22 2H16.6562M22 2V7.34375" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M22 12C22 16.714 22 19.0711 20.5355 20.5355C19.0711 22 16.714 22 12 22C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  )}
                </button>

                <button
                  onClick={onCopy}
                  className="action-bar-button"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: 'var(--text-primary)' }}>
                    <path d="M6 11C6 8.17157 6 6.75736 6.87868 5.87868C7.75736 5 9.17157 5 12 5H15C17.8284 5 19.2426 5 20.1213 5.87868C21 6.75736 21 8.17157 21 11V16C21 18.8284 21 20.2426 20.1213 21.1213C19.2426 22 17.8284 22 15 22H12C9.17157 22 7.75736 22 6.87868 21.1213C6 20.2426 6 18.8284 6 16V11Z" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M6 19C4.34315 19 3 17.6569 3 16V10C3 6.22876 3 4.34315 4.17157 3.17157C5.34315 2 7.22876 2 11 2H15C16.6569 2 18 3.34315 18 5" stroke="currentColor" strokeWidth="1.5"/>
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
                  onClick={onEdit}
                  className="action-bar-button"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: 'var(--text-primary)' }}>
                    <path d="M18.18 8.03933L18.6435 7.57589C19.4113 6.80804 20.6563 6.80804 21.4241 7.57589C22.192 8.34374 22.192 9.58868 21.4241 10.3565L20.9607 10.82M18.18 8.03933C18.18 8.03933 18.238 9.02414 19.1069 9.89309C19.9759 10.762 20.9607 10.82 20.9607 10.82M18.18 8.03933L13.9194 12.2999C13.6308 12.5885 13.4865 12.7328 13.3624 12.8919C13.2161 13.0796 13.0906 13.2827 12.9882 13.4975C12.9014 13.6797 12.8368 13.8732 12.7078 14.2604L12.2946 15.5L12.1609 15.901M20.9607 10.82L16.7001 15.0806C16.4115 15.3692 16.2672 15.5135 16.1081 15.6376C15.9204 15.7839 15.7173 15.9094 15.5025 16.0118C15.3203 16.0986 15.1268 16.1632 14.7396 16.2922L13.5 16.7054L13.099 16.8391M13.099 16.8391L12.6979 16.9728C12.5074 17.0363 12.2973 16.9867 12.1553 16.8447C12.0133 16.7027 11.9637 16.4926 12.0272 16.3021L12.1609 15.901M13.099 16.8391L12.1609 15.901" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M8 13H10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <path d="M8 9H14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <path d="M8 17H9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <path d="M19.8284 3.17157C18.6569 2 16.7712 2 13 2H11C7.22876 2 5.34315 2 4.17157 3.17157C3 4.34315 3 6.22876 3 10V14C3 17.7712 3 19.6569 4.17157 20.8284C5.34315 22 7.22876 22 11 22H13C16.7712 22 18.6569 22 19.8284 20.8284C20.7715 19.8853 20.9554 18.4796 20.9913 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>

                {onDelete && (
                  <button
                    onClick={onDelete}
                    className="action-bar-button action-bar-button--destructive"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: 'var(--destructive)' }}>
                      <path d="M20.5001 6H3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      <path d="M18.8334 8.5L18.3735 15.3991C18.1965 18.054 18.108 19.3815 17.243 20.1907C16.378 21 15.0476 21 12.3868 21H11.6134C8.9526 21 7.6222 21 6.75719 20.1907C5.89218 19.3815 5.80368 18.054 5.62669 15.3991L5.16675 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      <path d="M9.5 11L10 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      <path d="M14.5 11L14 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      <path d="M6.5 6C6.55588 6 6.58382 6 6.60915 5.99936C7.43259 5.97849 8.15902 5.45491 8.43922 4.68032C8.44784 4.65649 8.45667 4.62999 8.47434 4.57697L8.57143 4.28571C8.65431 4.03708 8.69575 3.91276 8.75071 3.8072C8.97001 3.38607 9.37574 3.09364 9.84461 3.01877C9.96213 3 10.0932 3 10.3553 3H13.6447C13.9068 3 14.0379 3 14.1554 3.01877C14.6243 3.09364 15.03 3.38607 15.2493 3.8072C15.3043 3.91276 15.3457 4.03708 15.4286 4.28571L15.5257 4.57697C15.5433 4.62992 15.5522 4.65651 15.5608 4.68032C15.841 5.45491 16.5674 5.97849 17.3909 5.99936C17.4162 6 17.4441 6 17.5 6" stroke="currentColor" strokeWidth="1.5"/>
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

