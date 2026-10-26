import type { MetadataRelease, ReleaseTrack } from './gateway';
import type { MediumDraft } from '../library/types';

export function physicalDiscCount(media: readonly { carrierId: string }[]): number {
  return media.every(row => ['cd', 'dvd', 'bd'].includes(row.carrierId)) ? media.length : 0;
}

export function releaseDiscCount(formats: MetadataRelease['formats']): number {
  return releaseMedia(formats).length;
}
export function releaseMedia(formats: MetadataRelease['formats']): MediumDraft[] {
  const physical = formats.filter(format => !['Box Set', 'All Media'].includes(format.name));
  return physical.every(format => ['CD', 'CDr', 'DVD', 'Blu-ray'].includes(format.name)
    && /^[1-9]\d*$/.test(format.qty) && Number(format.qty) <= 99)
    ? physical.flatMap(format => Array.from({ length: Number(format.qty) }, () => ({
      carrierId: ({ CD: 'cd', CDr: 'cd', DVD: 'dvd', 'Blu-ray': 'bd' } as Record<string, string>)[format.name], label: format.name,
    }))) : [];
}

// Source headings are sections, not inherently physical discs. Only promote
// complete peer sections when their count agrees with the physical edition.
export function sourceSections(tracks: ReleaseTrack[]): ReleaseTrack[][] {
  const sections: ReleaseTrack[][] = [];
  let current: ReleaseTrack[] = [];
  const playable = (rows: ReleaseTrack[]): boolean => rows.some(row => row.sub_tracks?.length ? playable(row.sub_tracks) : row.type_ !== 'heading');
  for (const row of tracks) {
    if ((row.type_ === 'heading' && row.heading_kind !== 'section') || row.sub_tracks?.length) {
      if (playable(current)) { sections.push(current); current = []; }
    }
    current.push(row);
    if (row.sub_tracks?.length) { sections.push(current); current = []; }
  }
  if (playable(current)) sections.push(current);
  else if (current.length && sections.length) sections[sections.length - 1].push(...current);
  return sections;
}

export function structureKeys(sections: ReleaseTrack[][], discCount: number, numbered: (position: string) => string | null): string[] | null {
  if (discCount < 2 || sections.length !== discCount) return null;
  const keys: (string | null)[] = [];
  const seen = new Set<string>();
  const visit = (rows: ReleaseTrack[], output: Set<string>): boolean => rows.every(row => {
    const key = row.disc_number == null ? numbered(row.position) : null; if (key) output.add(key);
    return visit(row.sub_tracks || [], output);
  });
  for (const section of sections) {
    const explicit = new Set<string>();
    if (!visit(section, explicit) || explicit.size > 1) return null;
    const key = [...explicit][0] ?? null;
    // Bonus sections within a known disc must stay on that disc.
    if (key && seen.has(key)) return null;
    if (key) seen.add(key);
    keys.push(key);
  }
  return keys.map((key, index) => key ?? `section:${index + 1}`);
}
