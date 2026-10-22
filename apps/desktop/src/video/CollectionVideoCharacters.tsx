import type { LibraryCopy } from '../library/types';
import type { VideoMetadata } from './gateway';
import { CollectionSourceData } from './CollectionSourceData';
import { animationCharacters } from './mergedPresentation';
import { VideoCharacters } from './VideoCharacters';
export function CollectionVideoCharacters({item, metadata, onSaved, onBusy}: {item:LibraryCopy; metadata:VideoMetadata|null; onSaved():Promise<void>; onBusy(value:boolean):void}) {
  if (!metadata?.work) return <p className="utility-copy">暂无角色资料。</p>;
  return <CollectionSourceData item={item} metadata={metadata} kind="characters" enabled={false} onSaved={onSaved} onBusy={onBusy}>{works => <VideoCharacters rows={animationCharacters(works)}/>}</CollectionSourceData>;
}
