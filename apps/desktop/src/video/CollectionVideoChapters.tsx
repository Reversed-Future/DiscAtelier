import { useState, type ReactNode } from 'react';
import type { LibraryCopy } from '../library/types';
import type { VideoMetadata } from './gateway';
import { CollectionSourceData } from './CollectionSourceData';
import { EpisodeList } from './EpisodeList';
import { mergeEpisodes } from './mergedEpisodes';
export function CollectionVideoChapters({ item, metadata, enabled, physical, hasPhysical, onSaved, onBusy, sourceKeys }: { item: LibraryCopy; metadata: VideoMetadata | null; enabled: boolean; physical: ReactNode; hasPhysical: boolean; onSaved(): Promise<void>; sourceKeys?:string[]; onBusy(value: boolean): void }) {
  const [tab, setTab] = useState(hasPhysical && !sourceKeys ? 'physical' : 'work');
  if (!metadata?.work) return <>{physical}</>;
  return <div className="collection-video-chapters">
    {hasPhysical && <nav className="disc-tabs" aria-label="章节内容"><button aria-selected={tab === 'physical'} onClick={() => setTab('physical')}>实体收录</button><button aria-selected={tab === 'work'} onClick={() => setTab('work')}>作品分集</button></nav>}
    {hasPhysical && tab === 'physical' ? physical : <CollectionSourceData sourceKeys={sourceKeys} item={item} metadata={metadata} kind="chapters" enabled={enabled} onSaved={onSaved} onBusy={onBusy}>{works => {
      const groups = mergeEpisodes(works);
      return groups.length ? <EpisodeList groups={groups}/> : <p className="utility-copy">暂无作品分集信息。</p>;
    }}</CollectionSourceData>}
  </div>;
}
