import type { MediumDraft } from '../library/types';
import { discPages } from './discTracks.ts';
import type { EditionContent, ReleaseTrack } from './gateway';

export interface CreditTrackOption { id: string; key: string; label: string; position: string; source: ReleaseTrack }

/** Credit references include the physical disc; source track numbers stay intact. */
export function creditTrackOptions(tracks: ReleaseTrack[], title: string, media: MediumDraft[]): CreditTrackOption[] {
  const rows = discPages(tracks, title, media).flatMap(page => (page.entries || [])
    .filter(entry => entry.source.type_ !== 'heading')
    .map(entry => ({ ...entry, disc: page.number ? `Disc ${page.number}` : '未分盘' })));
  const bases = rows.map(row => `${row.disc} / ${encodeURIComponent(row.source.position) || '#'}`);
  return rows.map((row, index) => ({
    key: `track:${row.path.join('.')}`, source: row.source,
    id: bases.filter(base => base === bases[index]).length > 1 || !row.source.position
      ? `${bases[index]} / #${row.path.join('.')}` : bases[index],
    label: `${row.disc} · ${row.source.position || '无曲号'} · ${row.source.title || '未命名'}`,
    position: row.source.position,
  }));
}

/** Old unambiguous references remain usable; ambiguous ones are never assigned to both discs. */
export function creditSelection(value: string, options: CreditTrackOption[]) {
  const unresolved: { id: string; key: string; label: string }[] = [];
  const selected = value.split(',').map(part => part.trim()).filter(Boolean).map(id => {
    if (id === 'All' || options.some(option => option.id === id)) return id;
    const matches = options.filter(option => option.position === id);
    if (matches.length === 1) return matches[0].id;
    if (!unresolved.some(option => option.id === id)) unresolved.push({ id, key: `unresolved:${id}`, label: matches.length ? `原曲号 ${id} · 请指定 Disc` : id });
    return id;
  });
  return { value: [...new Set(selected)].join(', '), options: [...options, ...unresolved] };
}

/** Update references with the edited row, including renumbering and disc moves. */
export function changeContentTracks(content: EditionContent, tracks: ReleaseTrack[], title: string, media: MediumDraft[], sameRows = false): EditionContent {
  const before = creditTrackOptions(content.tracks, title, media);
  const after = creditTrackOptions(tracks, title, media);
  const replacements = new Map(before.map(option => [option.id,
    after.find(next => next.source === option.source || (sameRows && next.key === option.key))?.id]));
  const credits = content.credits.map(credit => ({ ...credit,
    tracks: creditSelection(credit.tracks, before).value.split(',').map(part => part.trim()).filter(Boolean)
      .map(id => replacements.has(id) ? replacements.get(id) : id).filter(Boolean).join(', '),
  }));
  return { ...content, tracks, credits };
}

/** Presentation only: show scoped album credits beside their selected tracks. */
export function tracksWithCredits(content: EditionContent, title: string, media: MediumDraft[]): ReleaseTrack[] {
  const options = creditTrackOptions(content.tracks, title, media);
  const scopes = content.credits.map(credit => ({ credit,
    selected: new Set(creditSelection(credit.tracks, options).value.split(',').map(part => part.trim()).filter(Boolean)),
  }));
  const byTrack = new Map(options.map(option => [option.source, option.id]));
  const visit = (rows: ReleaseTrack[]): ReleaseTrack[] => rows.map(row => {
    const id = byTrack.get(row);
    const extraartists = [...(row.extraartists || [])];
    if (id) for (const { credit, selected } of scopes) {
      if ((selected.has(id) || selected.has('All')) && !extraartists.some(saved => saved.name === credit.name && saved.anv === credit.anv && saved.role === credit.role)) {
        extraartists.push({ ...credit, tracks: '' });
      }
    }
    return { ...row, extraartists, sub_tracks: row.sub_tracks ? visit(row.sub_tracks) : undefined };
  });
  return visit(content.tracks);
}
