import { useEffect, useRef, useState } from 'react';
import type { Descriptor, LibraryCopy } from '../library/types';
import { mediumLabel } from '../library/mediumLabel';
import { statuses } from '../library/types';
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
import { PlaybackControls } from '../playback/PlaybackControls';

export function Inspection({ item, carriers, onClose, onSaved, edit, artworkSlot, prepareClose, modelBusy, player }: {
  item: LibraryCopy; carriers: Descriptor[]; onClose(): void; onSaved(): Promise<void>; edit(): void;
  artworkSlot(node: HTMLDivElement | null): void; prepareClose(): Promise<void>; modelBusy: boolean;
  player: PlaybackController;
}) {
  const [neteaseOpen, setNeteaseOpen] = useState(false);
  const [tab, setTab] = useState('metadata');
  const [side, setSide] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(false);
  const editionContent = useEditionContent(item);
  const supplement = useMusicSupplement(item);
  const online = player.snapshot?.source.playlist.startsWith('netease-song:') && player.snapshot.source.mountPoint === item.editionId;
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
  return <><Modal title="收藏详情" onClose={onClose} busy={modelBusy} beforeClose={prepareClose} inspection shared>
    <div className="inspection-layout">
      <div className="object-stage">
        <div className={`inspection-artwork-slot${item.modelAssetId ? ' has-model' : ''}`} data-side={side} ref={artworkSlot}/>
        <div className="object-floor"/>
        {!item.modelAssetId && <button className="rotate-button" onClick={() => setSide(!side)}><Icon name="rotate"/>{side ? '正面' : '侧面'}</button>}
      </div>
      <section className="object-info">
        <h1 title={item.edition.title}>{item.edition.title}</h1><p className="object-creator">{item.edition.creator}</p>
        <nav className="detail-tabs" aria-label="详情内容">
          <button className={tab === 'metadata' ? 'active' : ''} onClick={() => setTab('metadata')}>资料</button>
          <button className={tab === 'tracks' ? 'active' : ''} onClick={() => setTab('tracks')}>曲目</button>
          <button className={tab === 'purchase' ? 'active' : ''} onClick={() => setTab('purchase')}>购入</button>
        </nav>
        <div ref={content} className="inspection-tab-content" data-tab={tab}>
          <div hidden={tab !== 'metadata'}><dl className="metadata">{fields.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl><EditionContents section="metadata" state={editionContent} album={supplement.value} item={item} player={player} onSaved={onSaved}/></div>
          <div className="inspection-tracks-page" hidden={tab !== 'tracks'}><EditionContents section="tracks" state={editionContent} album={supplement.value} item={item} player={player} onSaved={onSaved}/></div>
          <div hidden={tab !== 'purchase'}><dl className="metadata">{purchaseFields.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></div>
        </div>
        {online && <div className="inspection-player"><PlaybackControls player={player}/></div>}
        {(supplement.error || player.error) && <p className="form-error" role="alert">{supplement.error || player.error}</p>}
        <div className="object-actions"><button hidden={tab === 'tracks'} onClick={tab === 'metadata' ? edit : () => setEditingPurchase(true)} disabled={modelBusy}>{tab === 'metadata' ? '编辑版本' : '编辑购入'}</button><span>{statuses.find(status => status.id === item.copy.status)?.label}</span></div>
        <div className="detail-sources"><CollectionSource source={item.source}/>{item.edition.categoryId === 'music' && <button className="text-button" onClick={() => setNeteaseOpen(true)}>网易云资料</button>}</div>
      </section>
    </div>
  </Modal>{neteaseOpen && <NeteasePanel item={item} onClose={() => setNeteaseOpen(false)} onSaved={onSaved}/>} {editingPurchase && <EditPurchase item={item} onClose={() => setEditingPurchase(false)} onSaved={onSaved}/>}</>;
}
