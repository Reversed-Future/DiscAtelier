import { useRef, useState } from 'react';
import type { LibraryCopy } from '../library/types';
import { statuses } from '../library/types';
import { formatPrice } from '../library/money';
import { errorMessage } from '../library/gateway';
import { ConvertedPrice } from '../exchange/ConvertedPrice';
import { VideoCollectionCover } from '../video/VideoCollectionCover';
import { useVideoMetadata } from '../video/useVideoMetadata';
import { workTitles } from '../video/titles';

function ListIdentity({item,inspect}: {item:LibraryCopy;inspect(item:LibraryCopy):void}) {
  const isVideo = item.edition.categoryId === 'video';
  const {value} = useVideoMetadata(item.editionId, item.editionRevision, isVideo);
  const titles = isVideo && !value?.parts?.length
    ? workTitles(value?.work, item.edition.title, item.edition.creator)
    : { title: item.edition.title, subtitle: item.edition.creator };
  return <><VideoCollectionCover item={item} metadata={isVideo ? value : null}/>
    <div><button className="row-title" onClick={() => inspect(item)}>{titles.title}<span>{titles.subtitle || item.edition.creator}</span></button></div></>;
}

export function CollectionList({items,inspect,move}: {items:LibraryCopy[];inspect(item:LibraryCopy):void;move(id:string,beforeId:string|null):Promise<void>}) {
  const dragging = useRef<string|null>(null), pending = useRef(false);
  const [busy,setBusy] = useState(false), [error,setError] = useState('');
  const [over,setOver] = useState<{id:string;after:boolean}|null>(null);
  async function save(id:string,before:string|null) {
    if (pending.current || id === before) return;
    pending.current = true;setBusy(true);setError('');
    try {await move(id,before);} catch(cause) {setError(errorMessage(cause));}
    finally {pending.current=false;setBusy(false);setOver(null);dragging.current=null;}
  }
  return <div className="organizer" aria-busy={busy}>
    {error && <p className="form-error" role="alert">{error}</p>}
    <table><thead><tr><th>收藏</th><th>载体</th><th>状态</th><th>价格</th></tr></thead><tbody>
      {items.map((item,index) => <tr key={item.id} data-drop={over?.id === item.id ? over.after ? 'after' : 'before' : undefined}
        onDragOver={event => {if (!dragging.current || pending.current) return;event.preventDefault();event.dataTransfer.dropEffect='move';const rect=event.currentTarget.getBoundingClientRect();setOver({id:item.id,after:event.clientY > rect.top+rect.height/2});}}
        onDrop={event => {event.preventDefault();const id=dragging.current;if (!id) return;const rect=event.currentTarget.getBoundingClientRect();const after=event.clientY > rect.top+rect.height/2;void save(id,after ? items[index+1]?.id || null : item.id);}}>
        <td><div className="organizer-title-cell">
          <button type="button" className="collection-drag-handle" draggable={!busy} disabled={busy} aria-label={`拖动排序 ${item.edition.title}，也可按 Alt 加上下方向键`} title="拖动排序 · Alt + ↑ / ↓"
            onDragStart={event => {dragging.current=item.id;event.dataTransfer.setData('text/plain',item.id);event.dataTransfer.effectAllowed='move';}}
            onDragEnd={() => {dragging.current=null;setOver(null);}}
            onKeyDown={event => {if (!event.altKey || !['ArrowUp','ArrowDown'].includes(event.key)) return;event.preventDefault();event.stopPropagation();if(event.key==='ArrowUp' && index>0) void save(item.id,items[index-1].id);else if(event.key==='ArrowDown' && index<items.length-1) void save(item.id,items[index+2]?.id || null);}}>⠿</button>
          <ListIdentity item={item} inspect={inspect}/>
        </div></td>
        <td>{item.edition.media.map(medium => medium.carrierId.toUpperCase()).join(' + ')}</td>
        <td>{statuses.find(status => status.id === item.copy.status)?.label}</td>
        <td>{formatPrice(item.copy.amountMinor,item.copy.currency)}<ConvertedPrice amount={item.copy.amountMinor} currency={item.copy.currency}/></td>
      </tr>)}
    </tbody></table>
  </div>;
}
