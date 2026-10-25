import { CollectionVideoChapters } from '../video/CollectionVideoChapters';
import { workTitles } from '../video/titles';
import { VideoDetails } from '../video/VideoDetails';
import { CollectionVideoCharacters } from '../video/CollectionVideoCharacters';
import { VideoIntroduction } from '../video/VideoIntroduction';
import { videoWorks } from '../video/sources';
import { CollectionVideoGallery } from '../video/CollectionVideoGallery';
import type { VideoMetadata } from '../video/gateway';
import { partView } from '../video/parts';
import { portraitCover } from '../library/coverShape';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Descriptor, LibraryCopy } from '../library/types';
import { mediumLabel } from '../library/mediumLabel';
import { statuses } from '../library/types';
import { errorMessage, library } from '../library/gateway';
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
import { useOpticalPresence } from '../optical/useOpticalPresence';
import { OpticalTitleBadge } from '../optical/OpticalTitleBadge';
import { useCoverTilt } from './useCoverTilt';
import { LocalItemPanel } from '../local/LocalItemPanel';

export function Inspection({ item, carriers, onClose, onSaved, onDeleted, edit, artworkSlot, prepareClose, modelBusy, player, metadata, metadataError, partId, onPart, onOptical, hidden = false }: {
  item: LibraryCopy; carriers: Descriptor[]; onClose(): void; onSaved(): Promise<void>; onDeleted(): Promise<void>; edit(): void;
  artworkSlot(node: HTMLDivElement | null): void; prepareClose(): Promise<void>; modelBusy: boolean;
  player: PlaybackController; metadata:VideoMetadata|null; metadataError:string; partId:string; onPart(id:string,instant:boolean):void; onOptical(): void; hidden?: boolean;
}) {
  const [neteaseOpen, setNeteaseOpen] = useState(false);
  const [chapterBusy, setChapterBusy] = useState(false);
  const [tab, setTab] = useState('metadata');
  const [editingPurchase, setEditingPurchase] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false), [deleting, setDeleting] = useState(false), [deleteError, setDeleteError] = useState('');
  const [localOpen, setLocalOpen] = useState(false);
  async function remove() {
    if (deleting) return;
    setDeleting(true); setDeleteError('');
    try {
      await library.delete({ requestId: crypto.randomUUID(), id: item.id, expectedRevision: item.revision });
      await onDeleted();
    } catch (cause) { setDeleting(false); setDeleteError(errorMessage(cause)); }
  }
  const editionContent = useEditionContent(item);
  const optical = useOpticalPresence(true, 3000).find(value => value.copyId === item.id);
  const isVideo = item.edition.categoryId === 'video';
  const parts = metadata?.parts || [], part = parts.find(p => p.id === partId) || parts[0];
  const [tiltNode, setTiltNode] = useState<HTMLDivElement | null>(null);
  const [tiltSurface, setTiltSurface] = useState<HTMLDivElement | null>(null);
  const coverTilt = useCoverTilt(!item.modelAssetId && parts.length !== 2, tiltSurface, tiltNode);
  const attachArtwork = useCallback((node: HTMLDivElement | null) => {
    setTiltNode(node);
    artworkSlot(node);
  }, [artworkSlot]);
  const view = partView(metadata,part);
  const supplement = useMusicSupplement(item);
  const works = videoWorks(view);
  const titles = isVideo ? workTitles(view?.work, item.edition.title, item.edition.creator) : { title: item.edition.title, subtitle: item.edition.creator };
  const trackContent = <EditionContents section="tracks" state={editionContent} albums={supplement.value} links={supplement.links} bindings={supplement.bindings} item={item} player={player}/>;
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => { content.current?.scrollTo(0, 0); enter(content.current, 0); }, [tab, part?.id]);
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
  return <><Modal title="收藏详情" onClose={onClose} busy={modelBusy || chapterBusy} beforeClose={prepareClose} inspection shared hidden={hidden}>
    <div className="inspection-layout">
      <div className="object-stage" ref={setTiltSurface}>
        <div className={`inspection-artwork-slot${item.modelAssetId && !part ? ' has-model' : ''}`} data-portrait={(!!part || !item.modelAssetId) && portraitCover(item.edition)}
          data-tilt={coverTilt ? 'true' : undefined} ref={attachArtwork}/>
        <div className="object-floor"/>
        {parts.length === 2 && <button className="rotate-button" disabled={modelBusy || chapterBusy} onClick={event => onPart(parts.find(p => p.id !== part?.id)!.id,event.detail === 0)}><Icon name="rotate"/>翻面 · {parts.find(p => p.id !== part?.id)?.label}</button>}
      </div>
      <section className="object-info">
        {part && <p className="video-part-caption" role="status">{part.label} · {parts.indexOf(part) + 1} / {parts.length}</p>}
        <div className="object-title-line"><h1 title={titles.title}>{titles.title}</h1>{optical && <OpticalTitleBadge playing={optical.playing} drive={optical.drive} onOpen={onOptical}/>}</div>
        <p className="object-creator">{titles.subtitle}</p>
        <nav className="detail-tabs" aria-label="详情内容">
          <button className={tab === 'metadata' ? 'active' : ''} onClick={() => setTab('metadata')}>资料</button>
          <button className={tab === 'tracks' ? 'active' : ''} onClick={() => setTab('tracks')}>{isVideo ? '章节' : '曲目'}</button>
          {isVideo && <button className={tab === 'characters' ? 'active' : ''} onClick={() => setTab('characters')}>角色</button>}
          {isVideo && <button className={tab === 'gallery' ? 'active' : ''} onClick={() => setTab('gallery')}>图库</button>}
          <button className={tab === 'purchase' ? 'active' : ''} onClick={() => setTab('purchase')}>购入</button>
        </nav>
        <div ref={content} className="inspection-tab-content" data-tab={tab}>
          <div hidden={tab !== 'metadata'}>{isVideo && <VideoIntroduction key={part?.id || 'merged'} works={works}/>}<dl className="metadata">{fields.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>{item.edition.categoryId === 'video' && <VideoDetails value={view}/>}<EditionContents section="metadata" state={editionContent} albums={supplement.value} links={supplement.links} bindings={supplement.bindings} item={item} player={player}/></div>
          <div className="inspection-tracks-page" hidden={tab !== 'tracks'}>{isVideo ? <CollectionVideoChapters key={`${item.editionId}:${item.editionRevision}:${works.length}:${part?.id || 'merged'}`} item={item} metadata={metadata} sourceKeys={part?.sourceKeys} enabled={tab === 'tracks'} physical={trackContent} hasPhysical={!!editionContent.content?.tracks.length} onSaved={onSaved} onBusy={setChapterBusy} player={player}/> : trackContent}</div>
          {isVideo && <div hidden={tab !== 'characters'}><CollectionVideoCharacters key={`${item.editionId}:${item.editionRevision}:${works.length}:${part?.id || 'merged'}`} item={item} metadata={metadata} sourceKeys={part?.sourceKeys} onSaved={onSaved} onBusy={setChapterBusy}/></div>}
          {isVideo && <div hidden={tab !== 'gallery'}><CollectionVideoGallery key={`${item.editionId}:${item.editionRevision}:${works.length}:${part?.id || 'merged'}`} item={item} metadata={metadata} sourceKeys={part?.sourceKeys} enabled={tab === 'gallery'} onSaved={onSaved} onBusy={setChapterBusy}/></div>}
          <div hidden={tab !== 'purchase'}><dl className="metadata">{purchaseFields.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}{key === '购入价格' && <ConvertedPrice amount={item.copy.amountMinor} currency={item.copy.currency}/>}</dd></div>)}</dl></div>
        </div>
        {metadataError && <p className="form-error" role="alert">{metadataError}</p>}
        {supplement.error && <p className="form-error" role="alert">{supplement.error}</p>}
        <div className="object-actions">
          <button type="button" className="text-button delete-collection" onClick={() => { setDeleteError(''); setConfirmDelete(true); }} disabled={modelBusy || chapterBusy || deleting}>删除收藏</button>
          <button type="button" data-hidden={tab === 'tracks'} aria-hidden={tab === 'tracks'} tabIndex={tab === 'tracks' ? -1 : undefined} onClick={tab === 'purchase' ? () => setEditingPurchase(true) : edit} disabled={modelBusy || chapterBusy || deleting}>{tab === 'purchase' ? '编辑购入' : '编辑版本'}</button>
        </div>
        <div className="detail-sources"><CollectionSource source={item.source}/>{item.edition.categoryId === 'music' && <button className="text-button" onClick={() => setNeteaseOpen(true)}>网易云资料</button>}<button className="text-button" onClick={() => setLocalOpen(true)}>本地文件</button><span className="detail-status">{statuses.find(status => status.id === item.copy.status)?.label}</span></div>
      </section>
    </div>
  </Modal>
    {confirmDelete && <Modal title="删除收藏" onClose={() => setConfirmDelete(false)} busy={deleting} className="confirm-dialog">
      <div className="confirm-copy">
        <h3>删除收藏</h3>
        <p>{item.editionCopyCount > 1
          ? `将删除这一套收藏。同版本还有 ${item.editionCopyCount - 1} 套，版本资料、封面和模型会保留。`
          : '这是该版本最后一套收藏。删除后，版本资料、来源资料及不再被其他版本使用的封面或模型会一并删除；播放历史保留。'}</p>
        {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
      </div>
      <div className="confirm-actions">
        <button type="button" className="text-button" disabled={deleting} autoFocus onClick={() => setConfirmDelete(false)}>取消</button>
        <button type="button" className="solid-button" disabled={deleting} onClick={() => void remove()}>{deleting ? '删除中…' : '确认删除'}</button>
      </div>
    </Modal>}
    {neteaseOpen && <NeteasePanel rows={editionContent.content?.tracks || []} item={item} onClose={() => setNeteaseOpen(false)} onSaved={onSaved}/>} {editingPurchase && <EditPurchase item={item} onClose={() => setEditingPurchase(false)} onSaved={onSaved}/>}{localOpen && <LocalItemPanel item={item} onClose={() => setLocalOpen(false)}/>}</>;
}
