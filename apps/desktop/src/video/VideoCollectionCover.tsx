import type { LibraryCopy } from '../library/types';
import { Cover } from '../collection/Cover';
import { ModelPreview } from '../models/ModelPreview';
import { useVideoMetadata } from './useVideoMetadata';
import { VideoPartCards } from './VideoPartCards';
export function VideoCollectionCover({item}: {item:LibraryCopy}) {
  const {value} = useVideoMetadata(item.editionId,item.editionRevision,item.edition.categoryId === 'video');
  if (value?.parts?.length === 2) return <VideoPartCards item={item} metadata={value}/>;
  return item.modelAssetId ? <ModelPreview assetId={item.modelAssetId} authored={!item.coverAssetId} fallback={<Cover edition={item.edition} assetId={item.coverAssetId}/>}/> : <Cover edition={item.edition} assetId={item.coverAssetId}/>;
}
