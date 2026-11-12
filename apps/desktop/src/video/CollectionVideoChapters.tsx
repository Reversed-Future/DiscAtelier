import { useEffect, useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { LibraryCopy } from '../library/types';
import type { VideoMetadata } from './gateway';
import type { PlaybackController } from '../playback/usePlayback';
import { CollectionSourceData } from './CollectionSourceData';
import { EpisodeList } from './EpisodeList';
import { mergeEpisodes } from './mergedEpisodes';
import type { TrackPlayback } from '../metadata/TrackRow';

interface LocalBinding { copyId: string; path: string; label: string; episode?: number | null; track?: number | null }

export function CollectionVideoChapters({ item, metadata, enabled, physical, hasPhysical, onSaved, onBusy, sourceKeys, player }: { item: LibraryCopy; metadata: VideoMetadata | null; enabled: boolean; physical: ReactNode; hasPhysical: boolean; onSaved(): Promise<void>; sourceKeys?:string[]; onBusy(value: boolean): void; player: PlaybackController }) {
  const [tab, setTab] = useState(hasPhysical && !sourceKeys ? 'physical' : 'work');
  const [local, setLocal] = useState<LocalBinding[]>([]);
  useEffect(() => {
    let active = true;
    const load = () => {
      void invoke<LocalBinding[]>('local_files_get').then(values => {
        if (active) setLocal(values.filter(binding => binding.copyId === item.id));
      }).catch(() => {});
    };
    load();
    window.addEventListener('local-files-changed', load);
    return () => { active = false; window.removeEventListener('local-files-changed', load); };
  }, [item.id]);
  function localPlayback(number: string): TrackPlayback | undefined {
    const episode = Number(number.replace(/\D+/g, ''));
    const binding = local.find(value => value.episode === episode);
    if (!binding || !episode) return undefined;
    const current = player.active && player.snapshot?.source.playlist === `local:${binding.path}`;
    const playing = current && player.open;
    return {
      playing,
      busy: player.busy,
      play: () => {
        if (current && !player.open) {
          // Returning from the player leaves the session alive but hidden.
          // Re-open the UI and resume instead of only toggling the hidden pause state.
          player.show();
          if (player.snapshot?.paused) void player.control({ action: 'pause', paused: false });
        } else if (playing) void player.control({ action: 'pause', paused: !player.snapshot?.paused });
        else void player.startLocal(item.id, binding.path);
      },
    };
  }
  if (!metadata?.work) return <>{physical}</>;
  return <div className="collection-video-chapters">
    {hasPhysical && <nav className="disc-tabs" aria-label="章节内容"><button aria-selected={tab === 'physical'} onClick={() => setTab('physical')}>实体收录</button><button aria-selected={tab === 'work'} onClick={() => setTab('work')}>作品分集</button></nav>}
    {hasPhysical && tab === 'physical' ? physical : <CollectionSourceData sourceKeys={sourceKeys} item={item} metadata={metadata} kind="chapters" enabled={enabled} onSaved={onSaved} onBusy={onBusy}>{works => {
      const groups = mergeEpisodes(works, metadata.chapterLinks || []);
      return groups.length ? <EpisodeList groups={groups} localPlayback={localPlayback}/> : <p className="utility-copy">暂无作品分集信息。</p>;
    }}</CollectionSourceData>}
  </div>;
}
