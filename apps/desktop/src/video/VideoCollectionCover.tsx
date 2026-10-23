import type { LibraryCopy } from '../library/types';
import { Cover } from '../collection/Cover';
import { ModelPreview } from '../models/ModelPreview';
import { useVideoMetadata } from './useVideoMetadata';
import type { VideoMetadata } from './gateway';
import { VideoPartCards } from './VideoPartCards';
export function VideoCollectionCover({item,metadata}: {item:LibraryCopy;metadata?:VideoMetadata|null}) {
  const loaded = useVideoMetadata(item.editionId,item.editionRevision,metadata === undefined && item.edition.categoryId === 'video');
  const value = metadata === undefined ? loaded.value : metadata;
  if (value?.parts?.length === 2) return <VideoPartCards item={item} metadata={value}/>;
  return item.modelAssetId ? <ModelPreview assetId={item.modelAssetId} authored={!item.coverAssetId} fallback={<Cover edition={item.edition} assetId={item.coverAssetId}/>}/> : <Cover edition={item.edition} assetId={item.coverAssetId}/>;
}
