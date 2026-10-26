import type { MusicQueueContext } from '../integrations/gateway';
import { albumMatches, collectionRows, trackLeaves } from '../integrations/albumTracks.ts';
import { trackKey } from '../integrations/trackMatches.ts';
import { discPages } from '../metadata/discTracks.ts';
import { trackIndexForNumber } from '../local/match.ts';

/** Undefined scope follows saved local-file numbering; null is an unbound physical CD. */
export function linkedLyricSong(context: MusicQueueContext, number: number, discKey?: string | null): number | null {
  let rows = collectionRows(context.tracks, context.albums);
  if (discKey !== undefined) {
    const pages = discPages(rows, context.title, context.media);
    const page = discKey === null ? (pages.length === 1 ? pages[0] : undefined) : pages.find(disc => disc.key === discKey);
    if (!page) return null;
    // A CD's TOC numbers are local to that physical disc, not the release position text.
    rows = trackLeaves(page.tracks);
  }
  const row = rows[discKey === undefined ? trackIndexForNumber(rows, number) : number - 1];
  if (!row) return null;
  return albumMatches(context.tracks, context.albums, context.links, context.bindings, context.media).get(trackKey(row))?.id || null;
}
