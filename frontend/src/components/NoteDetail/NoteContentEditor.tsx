import { useRef, useEffect } from 'react'
import { useI18n } from '../../i18n'

interface NoteContentEditorProps {
  content: string
  summary: string | null
  isEditing: boolean
  activeTab: 'summary' | 'full'
  editedContent: string
  editedSummary: string
  onContentChange: (value: string) => void
  onSummaryChange: (value: string) => void
}

// Auto-resize textareas
const autoResizeTextarea = (textarea: HTMLTextAreaElement) => {
  textarea.style.height = 'auto'
  textarea.style.height = `${textarea.scrollHeight}px`
}

// Scroll cursor into view when editing
const scrollCursorIntoView = (textarea: HTMLTextAreaElement) => {
  const rect = textarea.getBoundingClientRect()
  const viewportHeight = window.visualViewport?.height || window.innerHeight
  const actionBarSpace = 80
  const availableBottom = viewportHeight - actionBarSpace

  if (rect.bottom > availableBottom) {
    const scrollAmount = rect.bottom - availableBottom + 20
    window.scrollBy({ top: scrollAmount, behavior: 'smooth' })
  }
}

export const NoteContentEditor = ({
  content,
  summary,
  isEditing,
  activeTab,
  editedContent,
  editedSummary,
  onContentChange,
  onSummaryChange,
}: NoteContentEditorProps) => {
  const { t } = useI18n()
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null)
  const summaryTextareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isEditing) {
      setTimeout(() => {
        if (contentTextareaRef.current) {
          autoResizeTextarea(contentTextareaRef.current)
        }
        if (summaryTextareaRef.current) {
          autoResizeTextarea(summaryTextareaRef.current)
        }
      }, 50)
    }
  }, [isEditing])

  return (
    <div className="px-5">
      {activeTab === 'summary' ? (
        isEditing ? (
          <textarea
            ref={summaryTextareaRef}
            value={editedSummary}
            onChange={(e) => {
              onSummaryChange(e.target.value)
              autoResizeTextarea(e.target)
              scrollCursorIntoView(e.target)
            }}
            className="w-full text-base leading-relaxed bg-transparent outline-none resize-none selectable-text overflow-hidden text-[var(--text-primary)]"
            style={{ scrollMarginBottom: 100 }}
            placeholder={t('noSummary')}
          />
        ) : summary ? (
          <p className="text-base leading-relaxed whitespace-pre-wrap selectable-text text-[var(--text-primary)]">
            {summary}
          </p>
        ) : (
          <p className="text-base leading-relaxed text-[var(--text-tertiary)]">
            {t('noSummary')}
          </p>
        )
      ) : isEditing ? (
        <textarea
          ref={contentTextareaRef}
          value={editedContent}
          onChange={(e) => {
            onContentChange(e.target.value)
            autoResizeTextarea(e.target)
            scrollCursorIntoView(e.target)
          }}
          className="w-full text-base leading-relaxed bg-transparent outline-none resize-none selectable-text overflow-hidden text-[var(--text-primary)]"
          style={{ scrollMarginBottom: 100 }}
          placeholder="Введите текст заметки..."
        />
      ) : (
        <p className="text-base leading-relaxed whitespace-pre-wrap selectable-text text-[var(--text-primary)]">
          {content}
        </p>
      )}
    </div>
  )
}

