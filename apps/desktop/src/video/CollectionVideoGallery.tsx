import type { LibraryCopy } from '../library/types';
import { library } from '../library/gateway';
import { video, type VideoMetadata } from './gateway';
import { CollectionSourceData } from './CollectionSourceData';
import { GalleryGrid } from './GalleryGrid';
import { galleryPictures, type GalleryPicture } from './mergedPresentation';

export function CollectionVideoGallery({ item, metadata, enabled, onSaved, onBusy, sourceKeys }: {
  item: LibraryCopy; metadata: VideoMetadata | null; enabled: boolean; onSaved(): Promise<void>;
  sourceKeys?: string[]; onBusy(value: boolean): void;
}) {
  if (!metadata?.work) return <p className="utility-copy">在编辑版本中关联作品后，可查看海报与剧照。</p>;
  async function setCover(picture: GalleryPicture) {
    onBusy(true);
    try {
      const dataUrl = await video.imageData(picture.url);
      await library.updateEdition({
        requestId: crypto.randomUUID(), editionId: item.editionId, expectedRevision: item.editionRevision,
        edition: item.edition, cover: { action: 'replace', dataUrl }, model: { action: 'keep' },
      });
      await onSaved();
    } finally { onBusy(false); }
  }
  return <CollectionSourceData sourceKeys={sourceKeys} item={item} metadata={metadata} kind="images" enabled={enabled} onSaved={onSaved} onBusy={onBusy}>
    {works => <GalleryGrid pictures={galleryPictures(works)} onSetCover={setCover}/>}
  </CollectionSourceData>;
}
