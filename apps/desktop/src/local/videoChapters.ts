import { video, type VideoWork } from '../video/gateway';
import type { TrackTitle } from './match';

/** Read saved video chapter metadata as options for a manual local association. */
export async function loadVideoChapters(editionId: string): Promise<TrackTitle[]> {
  const metadata = await video.metadata(editionId);
  const works = [metadata?.work, ...(metadata?.additionalWorks || [])].filter((work): work is VideoWork => !!work);
  const seen = new Set<number>();
  const result: TrackTitle[] = [];
  for (const work of works) {
    for (const chapter of work.chapters || []) {
      if (seen.has(chapter.id)) continue;
      seen.add(chapter.id);
      const title = chapter.title || chapter.originalTitle || `第 ${chapter.number} 章`;
      result.push({
        title,
        position: String(result.length + 1),
        label: `${chapter.group} · ${chapter.number} · ${title}`,
      });
    }
  }
  return result;
}
