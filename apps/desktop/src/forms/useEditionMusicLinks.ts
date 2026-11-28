import { useEffect, useMemo, useState } from 'react';
import { errorMessage } from '../library/gateway';
import { netease, type DiscAlbumLink, type LinkedMusicAlbum, type MusicLinkSelection, type MusicSupplement, type NeteaseSong, type SongLink } from '../integrations/gateway';
import { trackKey } from '../integrations/trackMatches';
import { albumRows, trackLeaves } from '../integrations/albumTracks';
import type { ReleaseTrack } from '../metadata/gateway';

interface SavedLinks { albums: LinkedMusicAlbum[]; tracks: SongLink[]; bindings: DiscAlbumLink[] }
interface AlbumEdit { previousId: number | null; album: MusicSupplement }
interface TrackEdit { position: string; title: string; song: NeteaseSong | null }

export function useEditionMusicLinks(editionId: string, enabled: boolean) {
  const [saved, setSaved] = useState<SavedLinks | null>(null);
  const [albumEdits, setAlbumEdits] = useState<AlbumEdit[]>([]);
  const [trackEdits, setTrackEdits] = useState<TrackEdit[]>([]);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setError('');
    void Promise.all([netease.albums(editionId), netease.links(editionId), netease.discAlbums(editionId)])
      .then(([albums, tracks, bindings]) => { if (live) setSaved({ albums, tracks, bindings }); })
      .catch(cause => { if (live) setError(errorMessage(cause)); });
    return () => { live = false; };
  }, [editionId, enabled, attempt]);

  const view = useMemo(() => {
    const cleared = new Set(trackEdits.map(trackKey));
    const replacements = new Map(albumEdits.map(e => [e.previousId, e.album]));
    const slots: (LinkedMusicAlbum & { previousId: number | null })[] = (saved?.albums ?? []).map(entry => ({
      previousId: entry.album.albumId, album: replacements.get(entry.album.albumId) ?? entry.album, legacyPositions: entry.legacyPositions,
    }));
    const first = replacements.get(null);
    if (first) slots.push({ previousId: null, album: first, legacyPositions: false });
    const albums = slots.map(({album, legacyPositions}) => ({
      album: cleared.size && album.links.length ? {...album, links: album.links.filter(l => !cleared.has(trackKey(l)))} : album, legacyPositions,
    }));
    const links = [...(saved?.tracks ?? []).filter(t => !cleared.has(trackKey(t))),
      ...trackEdits.flatMap(t => t.song ? [{ position: t.position, title: t.title, song: t.song }] : [])];
    const bindings = (saved?.bindings ?? []).map(b => ({...b, albumId: replacements.get(b.albumId)?.albumId ?? b.albumId}));
    return { slots, albums, links, bindings };
  }, [saved, albumEdits, trackEdits]);
  const selection: MusicLinkSelection | null = albumEdits.length || trackEdits.length ? {
    albums: albumEdits.map(e => ({previousId: e.previousId, albumId: e.album.albumId})),
    tracks: trackEdits.map(t => ({position: t.position, title: t.title, songId: t.song?.id ?? null})),
  } : null;
  return { ...view, loaded: !!saved, error, selection, retry: () => setAttempt(n => n + 1),
    savedAlbums: saved?.albums ?? [],
    replace(previousId: number | null, album: MusicSupplement, rows: ReleaseTrack[] | undefined) {
      const outgoing = view.slots.find(slot => slot.previousId === previousId);
      if (outgoing && rows && !trackLeaves(rows).length) {
        const removed = new Set(albumRows(outgoing).map(trackKey));
        for (const row of albumRows({ ...outgoing, album })) removed.delete(trackKey(row));
        setTrackEdits(edits => edits.filter(edit => !removed.has(trackKey(edit))));
      }
      setAlbumEdits(edits => [...edits.filter(e => e.previousId !== previousId), ...(previousId === album.albumId ? [] : [{previousId, album}])]);
    },
    select(track: ReleaseTrack, song: NeteaseSong | null) {
      setTrackEdits(edits => [...edits.filter(e => trackKey(e) !== trackKey(track)), {position: track.position, title: track.title, song}]);
    },
    reset() { setAlbumEdits([]); setTrackEdits([]); },
  };
}
