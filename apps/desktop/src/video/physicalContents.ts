import type { EditionDraft, MediumDraft } from '../library/types';
import type { EditionContent, ReleaseTrack } from '../metadata/gateway';
import { discPages, type DiscPage } from '../metadata/discTracks.ts';
import { carrierName } from '../metadata/physicalDiscs.ts';
import { changeContentTracks } from '../metadata/creditTracks.ts';

export function videoDiscPages(rows: ReleaseTrack[], edition: EditionDraft): DiscPage[] {
  const pages = discPages(rows, edition.title, edition.media);
  return [...edition.media.map((medium, index) => {
    const number = index + 1;
    const page = pages.find(value => value.number === number);
    const name = page?.titleEntry?.source.title || medium.label.trim() || carrierName(medium);
    return page ? { ...page, name } : { key: `manual:${number}`, name, tracks: [], entries: [], numbered: true, number };
  }), ...pages.filter(page => page.number === undefined)];
}

// Pin existing rows to their physical disc before a carrier change alters the interpretation of source numbers.
export function changeVideoMedia(content: EditionContent, edition: EditionDraft, media: MediumDraft[], removed?: number) {
  const slots = new Map<ReleaseTrack, number>();
  for (const page of discPages(content.tracks, edition.title, edition.media)) {
    if (page.number === undefined) continue;
    for (const entry of page.entries || []) slots.set(entry.source, page.number);
  }
  const visit = (row: ReleaseTrack): ReleaseTrack => {
    const slot = slots.get(row);
    const disc = slot && removed && slot > removed ? slot - 1 : slot;
    return { ...row, disc_number: disc ?? row.disc_number, sub_tracks: row.sub_tracks?.map(visit) };
  };
  return changeContentTracks(content, content.tracks.map(visit), edition.title, edition.media, true, media);
}
