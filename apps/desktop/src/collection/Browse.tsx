import { CollectionList } from './CollectionList';
import { VideoCollectionCover } from '../video/VideoCollectionCover';
import { useVideoMetadata } from '../video/useVideoMetadata';
import { workTitles } from '../video/titles';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useOpticalPresence } from '../optical/useOpticalPresence';
import { OpticalTitleBadge } from '../optical/OpticalTitleBadge';
import type { LibraryCopy } from '../library/types';
import { portraitCover } from '../library/coverShape';
import { enter } from '../ui/motion';

export function Browse({ items, selectedId, select, inspect, organize, modelActive, takenId, artworkSlot, move, onOptical }: {
  move(id:string,beforeId:string|null):Promise<void>; items: LibraryCopy[]; selectedId: string; select(id: string): void; inspect(item: LibraryCopy): void; organize: boolean; modelActive: boolean; takenId?: string; artworkSlot(node: HTMLDivElement | null): void; onOptical(): void;
}) {
  const index = Math.max(0, items.findIndex(item => item.id === selectedId));
  const selected = items[index];
  const optical = useOpticalPresence(true, 3000).find(value => value.copyId === selected?.id);
  const selectedVideo = useVideoMetadata(selected?.editionId || '', selected?.editionRevision || 0, selected?.edition.categoryId === 'video');
  const titles = selected?.edition.categoryId === 'video' ? selectedVideo.value?.parts?.length ? {title:selected.edition.title,subtitle:selected.edition.creator} : workTitles(selectedVideo.value?.work, selected.edition.title, selected.edition.creator) : { title: selected?.edition.title, subtitle: selected?.edition.creator };
  const caption = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const startX = useRef<number | undefined>(undefined);
  const dragged = useRef(false);
  const [keyNavigation, setKeyNavigation] = useState(false);
  useEffect(() => { enter(caption.current); }, [items[index]?.id]);
  useEffect(() => { enter(root.current, 0); }, [organize]);
  useEffect(() => { if (keyNavigation) root.current?.querySelector<HTMLButtonElement>('[data-current="true"]')?.focus(); }, [index, keyNavigation]);
  if (organize) return <CollectionList items={items} inspect={inspect} move={move}/>;
  return <div className="record-store" ref={root} onKeyDown={event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault(); setKeyNavigation(true);
    select(items[Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)))].id);
  }}>
    <div className="record-stage" onPointerDown={event => { startX.current = event.clientX; dragged.current = false; }} onPointerUp={event => {
      if (startX.current === undefined) return;
      const delta = event.clientX - startX.current;
      if (Math.abs(delta) > 65) { dragged.current = true; select(items[Math.max(0, Math.min(items.length - 1, index + (delta < 0 ? 1 : -1)))].id); }
      startX.current = undefined;
    }} onPointerCancel={() => { startX.current = undefined; }}>
      {items.map((item, itemIndex) => {
        const distance = itemIndex - index;
        if (Math.abs(distance) > 3) return null;
        return <button key={item.id} data-collection-id={item.id} className={`record-sleeve${item.modelAssetId ? ' has-model' : ''}`} data-portrait={!item.modelAssetId && portraitCover(item.edition)} data-category={item.edition.categoryId} data-current={distance === 0} data-offstage={Math.abs(distance) > 2} inert={Math.abs(distance) > 2}
          aria-label={`${distance === 0 ? '取出' : '选择'} ${item.edition.title}`} tabIndex={distance === 0 ? 0 : -1}
          style={{ '--distance': distance, '--abs-distance': Math.abs(distance), '--direction': Math.sign(distance) } as CSSProperties}
          onClick={() => { if (dragged.current) { dragged.current = false; return; } setKeyNavigation(false); distance === 0 ? inspect(item) : select(item.id); }}>
          {/* Keep the same decoded image node while it moves into/out of the
              centre. Replacing it with a portal forced another cache lookup. */}
          <div className="shelf-standin" data-taken={takenId === item.id}><VideoCollectionCover item={item}/></div>
          {distance === 0 && modelActive && <div className="shelf-artwork-slot" ref={artworkSlot}/>}
        </button>;
      })}
    </div>
    <div className="record-caption" ref={caption}><span className="record-counter">{String(index + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}</span><div className="record-title-line"><h1>{titles.title}</h1>{optical && <OpticalTitleBadge playing={optical.playing} drive={optical.drive} onOpen={onOptical}/>}</div><p>{titles.subtitle}</p></div>
  </div>;
}
