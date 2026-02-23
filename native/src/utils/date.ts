import { Note } from '../api/types';

export type DateGroup = {
  title: string;
  data: Note[];
};

export function groupNotesByDate(notes: Note[], t: (key: string) => string): DateGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);
  const monthAgo = new Date(today.getFullYear(), today.getMonth(), 1);

  const groups: Record<string, Note[]> = {};
  const groupOrder: string[] = [];

  const getGroupKey = (dateStr: string): string => {
    const date = new Date(dateStr);
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (dateOnly.getTime() === today.getTime()) return t('today');
    if (dateOnly.getTime() === yesterday.getTime()) return t('yesterday');
    if (dateOnly >= weekAgo) return t('thisWeek');
    if (dateOnly >= monthAgo) return t('thisMonth');

    // Earlier months: "January 2024" etc.
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  for (const note of notes) {
    const key = getGroupKey(note.created_at);
    if (!groups[key]) {
      groups[key] = [];
      groupOrder.push(key);
    }
    groups[key].push(note);
  }

  return groupOrder.map((title) => ({ title, data: groups[title] }));
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatRelativeTime(dateStr: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  const date = new Date(dateStr);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);

  if (minutes < 1) return t('justNow');
  if (minutes < 60) return t('minutesAgo', { count: minutes });
  if (hours < 24) return t('hoursAgo', { count: hours });

  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function formatNoteDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
