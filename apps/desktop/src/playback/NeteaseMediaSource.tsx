import { useEffect, useState } from 'react';
import { library } from '../library/gateway';
import type { PlaybackController } from './usePlayback';
import { useSystemMediaSource } from './useSystemMediaSource';

/**
 * Keeps NetEase media metadata registered even after its player panel is
 * closed. The taskbar must continue to show the linked edition cover and
 * accept transport commands while playback runs in the main window.
 */
export function NeteaseMediaSource({ player }: { player: PlaybackController }) {
  const queue = player.musicQueue;
  const album = queue.current;
  const [cover, setCover] = useState<{ editionId: string; id: string | null } | null>(null);
  useEffect(() => {
    if (!album) return;
    let live = true;
    void library.list({ categoryId: 'music', status: null, query: '' }).then(page => {
      if (live) setCover({
        editionId: album.editionId,
        id: page.copies.find(copy => copy.editionId === album.editionId)?.coverAssetId || null,
      });
    }).catch(() => {});
    return () => { live = false; };
  }, [album?.editionId]);
  useSystemMediaSource(player, {
    title: album?.title || player.snapshot?.title || '',
    artist: album?.artists.join('、') || '',
    album: album?.title || '',
    coverAssetId: cover?.editionId === album?.editionId ? cover?.id || undefined : undefined,
    previous: album ? () => queue.step(-1) : undefined,
    next: album ? () => queue.step(1) : undefined,
    repeat: queue.mode,
    setRepeat: mode => queue.setMode(mode),
  });
  return null;
}
