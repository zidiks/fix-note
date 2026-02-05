import { useState, useMemo, useEffect } from 'react'
import { motion } from 'framer-motion'
import { format, isToday, isYesterday } from 'date-fns'
import { enUS, ru } from 'date-fns/locale'
import { SharedNoteResponse } from '../api/client'
import { useTelegram } from '../hooks/useTelegram'
import { useI18n } from '../i18n'
import { ImageGallery } from './ui/ImageGallery'
import { LinkPreview, extractUrls } from './ui/LinkPreview'
import { LoadingSpinner } from './ui/LoadingSpinner'
import { VoicePlayer } from './ui/VoicePlayer'
import { NoteTabs } from './NoteDetail/NoteTabs'
import { NoteContentEditor } from './NoteDetail/NoteContentEditor'

interface SharedNoteViewProps {
  data?: SharedNoteResponse
  isLoading: boolean
}

export const SharedNoteView = ({ data, isLoading }: SharedNoteViewProps) => {
  const { hapticImpact, close } = useTelegram()
  const { t, language } = useI18n()
  const locale = language === 'ru' ? ru : enUS
  const [activeTab, setActiveTab] = useState<'summary' | 'full'>(() => 
    data?.note.summary ? 'summary' : 'full'
  )

  // Update active tab when data loads
  useEffect(() => {
    if (data?.note.summary) {
      setActiveTab('summary')
    } else {
      setActiveTab('full')
    }
  }, [data?.note.id, data?.note.summary])

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-secondary)]">
        <div className="text-center">
          <LoadingSpinner size="lg" className="mx-auto mb-4" />
          <p className="text-[var(--text-secondary)]">Загрузка заметки...</p>
        </div>
      </div>
    )
  }

  // Not found or access denied
  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--bg-secondary)]">
        <div className="text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-xl font-bold mb-2 text-[var(--text-primary)]">
            Заметка не найдена
          </h2>
          <p className="mb-6 text-[var(--text-secondary)]">
            Возможно, ссылка устарела или у вас нет доступа к этой заметке
          </p>
          <button
            onClick={() => {
              hapticImpact('light')
              close()
            }}
            className="px-6 py-3 rounded-xl font-semibold bg-[var(--accent)] text-white"
          >
            Закрыть
          </button>
        </div>
      </div>
    )
  }

  const { note } = data
  const isVoice = note.source === 'voice'
  const hasImages = note.images && note.images.length > 0

  // Display title: AI-generated or first line of summary/content
  const displayTitle = note.title?.trim() ||
    (note.summary ? note.summary.split('\n')[0].trim() : null) ||
    note.content.split('\n')[0].trim() ||
    null

  // Extract URLs from content
  const urls = useMemo(() => extractUrls(note.content), [note.content])

  const formattedDate = useMemo(() => {
    const d = new Date(note.created_at)
    if (isToday(d)) return `${t('today')}, ${format(d, 'HH:mm', { locale })}`
    if (isYesterday(d)) return `${t('yesterday')}, ${format(d, 'HH:mm', { locale })}`
    return format(d, 'd MMM', { locale })
  }, [note.created_at, language, t])

  return (
    <motion.div
      className="min-h-screen bg-[var(--bg-secondary)]"
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.2 }}
    >
      {/* Content */}
      <main
        className="pt-4 safe-area-top hide-scrollbar overflow-y-auto overflow-x-hidden"
        style={{
          paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))'
        }}
      >
        {/* Title */}
        {displayTitle && (
          <h1 className="text-[22px] font-bold mt-2 mb-1.5 leading-6 text-[var(--text-primary)] px-5 break-words">
            {displayTitle}
          </h1>
        )}

        {/* Date */}
        <p className="text-base font-medium mb-5 text-[var(--text-secondary)] px-5">
          {formattedDate}
        </p>

        {/* Voice Player - show for voice notes with voice_url */}
        {isVoice && note.voice_url && note.duration_seconds && (
          <VoicePlayer
            voiceUrl={note.voice_url}
            duration={note.duration_seconds}
            className="px-5"
          />
        )}

        {/* Images gallery - show at the top if there are images */}
        {hasImages && (
          <ImageGallery className="px-5" images={note.images!} />
        )}

        {/* Tabs: AI Summary | Full Text */}
        <NoteTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          hasSummary={!!note.summary}
        />

        {/* Tab content - read-only mode */}
        <NoteContentEditor
          content={note.content}
          summary={note.summary}
          isEditing={false}
          activeTab={activeTab}
          editedContent={note.content}
          editedSummary={note.summary || ''}
          onContentChange={() => {}}
          onSummaryChange={() => {}}
        />

        {/* Link previews */}
        {urls.length > 0 && (
          <div className="mt-6 px-5">
            <h3 className="text-xs font-semibold uppercase mb-2 text-[var(--text-secondary)]">
              Ссылки ({urls.length})
            </h3>
            <div className="space-y-2">
              {urls.map((url, index) => (
                <LinkPreview
                  key={index}
                  url={url}
                  onClick={() => hapticImpact('light')}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Bottom fade gradient */}
      <motion.div
        className="bottom-fade"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{
          delay: 0.15,
          duration: 0.25,
          ease: [0.25, 0.46, 0.45, 0.94]
        }}
      />
    </motion.div>
  )
}

