import type { LibraryCopy } from '../library/types';
import type { VideoMetadata } from './gateway';
import { CollectionSourceData } from './CollectionSourceData';
import { GalleryGrid } from './GalleryGrid';
import { galleryPictures } from './mergedPresentation';
export function CollectionVideoGallery({item, metadata, enabled, onSaved, onBusy}: {item: LibraryCopy; metadata: VideoMetadata | null; enabled: boolean; onSaved(): Promise<void>; onBusy(value: boolean): void}) {
  if (!metadata?.work) return <p className="utility-copy">在编辑版本中关联作品后，可查看海报与剧照。</p>;
  return <CollectionSourceData item={item} metadata={metadata} kind="images" enabled={enabled} onSaved={onSaved} onBusy={onBusy}>{works => <GalleryGrid pictures={galleryPictures(works)}/>}</CollectionSourceData>;
}
