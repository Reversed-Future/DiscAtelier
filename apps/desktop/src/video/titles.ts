import type { VideoWork } from './gateway';
export function workTitles(work: VideoWork | null | undefined, fallbackTitle = '', fallbackSubtitle = '') {
  if (!work) return { title: fallbackTitle, subtitle: fallbackSubtitle };
  const title = work.originalTitle.trim() || work.title;
  return { title, subtitle: work.title !== title ? work.title : '' };
}
