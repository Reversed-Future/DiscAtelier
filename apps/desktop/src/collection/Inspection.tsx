import { CollectionVideoChapters } from '../video/CollectionVideoChapters';
import { workTitles } from '../video/titles';
import { VideoDetails } from '../video/VideoDetails';
import { CollectionVideoCharacters } from '../video/CollectionVideoCharacters';
import { VideoIntroduction } from '../video/VideoIntroduction';
import { videoWorks } from '../video/sources';
import { CollectionVideoGallery } from '../video/CollectionVideoGallery';
import { useVideoMetadata } from '../video/useVideoMetadata';
import { portraitCover } from '../library/coverShape';
import { useEffect, useRef, useState } from 'react';
import type { Descriptor, LibraryCopy } from '../library/types';
import { mediumLabel } from '../library/mediumLabel';
import { statuses } from '../library/types';
import { ConvertedPrice } from '../exchange/ConvertedPrice';
import { formatPrice } from '../library/money';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import { enter } from '../ui/motion';
import { EditPurchase } from '../forms/EditPurchase';
import { EditionContents } from './EditionContents';
import { useEditionContent } from './useEditionContent';
import { NeteasePanel } from '../integrations/NeteasePanel';
import { CollectionSource } from '../metadata/CollectionSource';
import { useMusicSupplement } from './useMusicSupplement';
import type { PlaybackController } from '../playback/usePlayback';

export function Inspection({ item, carriers, onClose, onSaved, edit, artworkSlot, prepareClose, modelBusy, player }: {
  item: LibraryCopy; carriers: Descriptor[]; onClose(): void; onSaved(): Promise<void>; edit(): void;
  artworkSlot(node: HTMLDivElement | null): void; prepareClose(): Promise<void>; modelBusy: boolean;
  player: PlaybackController;
}) {
  const [neteaseOpen, setNeteaseOpen] = useState(false);
  const [chapterBusy, setChapterBusy] = useState(false);
  const [tab, setTab] = useState('metadata');
  const [side, setSide] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(false);
  const editionContent = useEditionContent(item);
  const isVideo = item.edition.categoryId === 'video';
  const videoMetadata = useVideoMetadata(item.editionId, item.editionRevision, isVideo);
  const supplement = useMusicSupplement(item);
  const works = videoWorks(videoMetadata.value);
  const titles = isVideo ? workTitles(videoMetadata.value?.work, item.edition.title, item.edition.creator) : { title: item.edition.title, subtitle: item.edition.creator };
  const trackContent = <EditionContents section="tracks" state={editionContent} albums={supplement.value} links={supplement.links} bindings={supplement.bindings} item={item} player={player}/>;
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => { content.current?.scrollTo(0, 0); enter(content.current, 0); }, [tab]);
  const fields = [
    ['版本', item.edition.editionLabel],
    ['载体', item.edition.media.map(medium => mediumLabel(medium, carriers)).join(' / ')],
    ['条码', item.edition.barcode], ['品番', item.edition.catalogNumber],
    ['收藏时间', new Date(item.addedAt).toLocaleDateString('zh-CN')],
  ].filter(([, value]) => value);
  const purchaseFields = [
    ['状态', statuses.find(status => status.id === item.copy.status)?.label],
    ['购入日期', item.copy.acquiredAt], ['购入价格', formatPrice(item.copy.amountMinor, item.copy.currency)],
    ['购入位置', item.copy.seller], ['购买链接', item.copy.purchaseUrl], ['存放位置', item.copy.storageLocation], ['备注', item.copy.notes],
  ].filter(([, value]) => value);
  return <><Modal title="收藏详情" onClose={onClose} busy={modelBusy || chapterBusy} beforeClose={prepareClose} inspection shared>
    <div className="inspection-layout">
      <div className="object-stage">
        <div className={`inspection-artwork-slot${item.modelAssetId ? ' has-model' : ''}`} data-side={side} data-portrait={!item.modelAssetId && portraitCover(item.edition)} ref={artworkSlot}/>
        <div className="object-floor"/>
        {!item.modelAssetId && <button className="rotate-button" onClick={() => setSide(!side)}><Icon name="rotate"/>{side ? '正面' : '侧面'}</button>}
      </div>
      <section className="object-info">
        <h1 title={titles.title}>{titles.title}</h1><p className="object-creator">{titles.subtitle}</p>
        <nav className="detail-tabs" aria-label="详情内容">
          <button className={tab === 'metadata' ? 'active' : ''} onClick={() => setTab('metadata')}>资料</button>
          <button className={tab === 'tracks' ? 'active' : ''} onClick={() => setTab('tracks')}>{isVideo ? '章节' : '曲目'}</button>
          {isVideo && <button className={tab === 'characters' ? 'active' : ''} onClick={() => setTab('characters')}>角色</button>}
          {isVideo && <button className={tab === 'gallery' ? 'active' : ''} onClick={() => setTab('gallery')}>图库</button>}
          <button className={tab === 'purchase' ? 'active' : ''} onClick={() => setTab('purchase')}>购入</button>
        </nav>
        <div ref={content} className="inspection-tab-content" data-tab={tab}>
          <div hidden={tab !== 'metadata'}>{isVideo && <VideoIntroduction works={works}/>}<dl className="metadata">{fields.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>{item.edition.categoryId === 'video' && <VideoDetails value={videoMetadata.value}/>}<EditionContents section="metadata" state={editionContent} albums={supplement.value} links={supplement.links} bindings={supplement.bindings} item={item} player={player}/></div>
          <div className="inspection-tracks-page" hidden={tab !== 'tracks'}>{isVideo ? <CollectionVideoChapters key={`${item.editionId}:${item.editionRevision}:${works.length}`} item={item} metadata={videoMetadata.value} enabled={tab === 'tracks'} physical={trackContent} hasPhysical={!!editionContent.content?.tracks.length} onSaved={onSaved} onBusy={setChapterBusy}/> : trackContent}</div>
          {isVideo && <div hidden={tab !== 'characters'}><CollectionVideoCharacters key={`${item.editionId}:${item.editionRevision}:${works.length}`} item={item} metadata={videoMetadata.value} onSaved={onSaved} onBusy={setChapterBusy}/></div>}
          {isVideo && <div hidden={tab !== 'gallery'}><CollectionVideoGallery key={`${item.editionId}:${item.editionRevision}:${works.length}`} item={item} metadata={videoMetadata.value} enabled={tab === 'gallery'} onSaved={onSaved} onBusy={setChapterBusy}/></div>}
          <div hidden={tab !== 'purchase'}><dl className="metadata">{purchaseFields.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}{key === '购入价格' && <ConvertedPrice amount={item.copy.amountMinor} currency={item.copy.currency}/>}</dd></div>)}</dl></div>
        </div>
        {videoMetadata.error && <p className="form-error" role="alert">{videoMetadata.error}</p>}
        {supplement.error && <p className="form-error" role="alert">{supplement.error}</p>}
        <div className="object-actions"><button data-hidden={tab === 'tracks'} aria-hidden={tab === 'tracks'} tabIndex={tab === 'tracks' ? -1 : undefined} onClick={tab === 'purchase' ? () => setEditingPurchase(true) : edit} disabled={modelBusy || chapterBusy}>{tab === 'purchase' ? '编辑购入' : '编辑版本'}</button></div>
        <div className="detail-sources"><CollectionSource source={item.source}/>{item.edition.categoryId === 'music' && <button className="text-button" onClick={() => setNeteaseOpen(true)}>网易云资料</button>}<span className="detail-status">{statuses.find(status => status.id === item.copy.status)?.label}</span></div>
      </section>
    </div>
  </Modal>{neteaseOpen && <NeteasePanel rows={editionContent.content?.tracks || []} item={item} onClose={() => setNeteaseOpen(false)} onSaved={onSaved}/>} {editingPurchase && <EditPurchase item={item} onClose={() => setEditingPurchase(false)} onSaved={onSaved}/>}</>;
}
