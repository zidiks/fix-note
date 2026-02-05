import { useTelegram } from '../../hooks/useTelegram'
import { useI18n } from '../../i18n'

interface NoteTabsProps {
  activeTab: 'summary' | 'full'
  onTabChange: (tab: 'summary' | 'full') => void
  hasSummary: boolean
}

export const NoteTabs = ({ activeTab, onTabChange, hasSummary }: NoteTabsProps) => {
  const { hapticImpact } = useTelegram()
  const { t } = useI18n()

  if (!hasSummary) return null

  return (
    <div className="mb-4">
      <div className="flex border-b border-[var(--separator)]">
        <button
          type="button"
          onClick={() => {
            hapticImpact('light')
            onTabChange('summary')
          }}
          className="flex-1 pb-3 pt-1 text-center text-base font-medium transition-colors"
          style={{
            color: activeTab === 'summary' ? 'var(--text-primary)' : 'var(--text-tertiary)',
            borderBottomWidth: 2,
            borderBottomStyle: 'solid',
            borderBottomColor: activeTab === 'summary' ? 'var(--accent)' : 'transparent',
            marginBottom: -1,
          }}
        >
          {t('tabAiSummary')}
        </button>
        <button
          type="button"
          onClick={() => {
            hapticImpact('light')
            onTabChange('full')
          }}
          className="flex-1 pb-3 pt-1 text-center text-base font-medium transition-colors"
          style={{
            color: activeTab === 'full' ? 'var(--text-primary)' : 'var(--text-tertiary)',
            borderBottomWidth: 2,
            borderBottomStyle: 'solid',
            borderBottomColor: activeTab === 'full' ? 'var(--accent)' : 'transparent',
            marginBottom: -1,
          }}
        >
          {t('tabFullText')}
        </button>
      </div>
    </div>
  )
}

