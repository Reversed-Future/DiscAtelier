import type { EditionDraft } from '../library/types';
import type { EditionContent, ReleaseTrack } from '../metadata/gateway';
import type { BlurayPlaylist, CdTrack, DvdChapter } from '../optical/gateway';
import { formatDuration } from '../optical/bluraySegments.ts';
import { changeContentTracks } from '../metadata/creditTracks.ts';
import { updateTrackRows } from '../forms/contentTracks.ts';
import { videoDiscPages, changeVideoMedia } from './physicalContents.ts';

export interface DiscProgram {
  id: string; duration: number;
  entries: { position: string; title: string; duration: number }[];
}
export interface OpticalImport {
  title: string; carrier: 'bd' | 'dvd' | 'cd'; programs: DiscProgram[];
}
export type ImportMode = 'append' | 'replace';

function chapters(id: string, duration: number, marks: DvdChapter[]): DiscProgram {
  const entries = marks.filter(mark => mark.durationSeconds > 0).map(mark => ({
    position: String(mark.index), title: `第 ${mark.index} 章`, duration: mark.durationSeconds,
  }));
  if (entries.length && marks[0].startSeconds > 0) {
    entries.unshift({position: '', title: '首个章节标记之前', duration: marks[0].startSeconds});
  }
  if (!entries.length && duration > 0) entries.push({position: '1', title: id, duration});
  return {id, duration, entries};
}

export function blurayPrograms(lists: BlurayPlaylist[]) {
  return lists.filter(list => list.durationSeconds > 0)
    .map(list => chapters(list.playlist, list.durationSeconds, list.chapters))
    .sort((a, b) => b.duration - a.duration || a.id.localeCompare(b.id));
}
export function dvdProgram(title: number, marks: DvdChapter[]) {
  const last = marks.at(-1);
  return chapters(`DVD 标题 ${title}`, last ? last.startSeconds + last.durationSeconds : 0, marks);
}
export function cdProgram(tracks: CdTrack[]): DiscProgram {
  return {id: '音轨', duration: tracks.reduce((sum, t) => sum + t.durationSeconds, 0),
    entries: tracks.map(t => ({position: String(t.number), duration: t.durationSeconds,
      title: `音轨 ${t.number}`}))};
}

export function importDisc(edition: EditionDraft, content: EditionContent, slot: number, source: OpticalImport, mode: ImportMode) {
  const medium = edition.media[slot - 1];
  if (!medium || !source.programs.some(p => p.entries.length)) throw Error('请选择碟片和要导入的内容。');
  const label = source.title.trim() || medium.label;
  const media = edition.media.map((m, i) => i === slot - 1 ? {carrierId: source.carrier, label} : m);
  const draft = changeVideoMedia(content, edition, media);
  const page = videoDiscPages(draft.tracks, {...edition, media}).find(p => p.number === slot);
  let retained = draft.tracks;
  if (mode === 'replace') {
    const remove = new Set(page?.entries?.map(e => e.source));
    function keep(row: ReleaseTrack): ReleaseTrack[] {
      if (remove.has(row)) return (row.sub_tracks || []).flatMap(keep);
      return row.sub_tracks?.length ? [{...row, sub_tracks: row.sub_tracks.flatMap(keep)}] : [row];
    }
    retained = retained.flatMap(keep);
  } else if (page?.titleEntry && label) {
    retained = updateTrackRows(retained, page.titleEntry.path, { title: label });
  }
  const imported: ReleaseTrack[] = [];
  for (const program of source.programs) {
    if (source.programs.length > 1) imported.push({ type_: 'heading', heading_kind: 'section', disc_number: slot, title: program.id, position: '', duration: '' });
    for (const row of program.entries) imported.push({type_: 'track', disc_number: slot, title: row.title,
      position: row.position, duration: formatDuration(row.duration)});
  }
  return {edition: {...edition, media}, content: changeContentTracks(draft, [...retained, ...imported], edition.title, media)};
}
