import { useRef, useState } from 'react';
import type { LibraryCopy } from '../library/types';
import { library, errorMessage } from '../library/gateway';
import { Modal } from '../ui/Modal';

export function DeleteCollection({ item, onClose, onDeleted }: { item: LibraryCopy; onClose(): void; onDeleted(): Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = useRef(false);
  async function remove() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      await library.delete({ requestId: crypto.randomUUID(), id: item.id, expectedRevision: item.revision });
      await onDeleted(); onClose();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { pending.current = false; setBusy(false); }
  }
  return <Modal title="删除收藏" onClose={onClose} busy={busy} className="confirm-dialog">
    <div className="confirm-copy"><h3>{item.edition.title}</h3>
      <p>{item.editionCopyCount > 1 ? `将删除这一套收藏。同版本还有 ${item.editionCopyCount - 1} 套，版本资料、封面和模型会保留。` : '这是该版本最后一套收藏。删除后，版本资料、来源资料及不再被其他版本使用的封面或模型会一并删除；播放历史保留。'}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
    <div className="confirm-actions"><button className="text-button" disabled={busy} autoFocus onClick={onClose}>取消</button><button className="solid-button" disabled={busy} onClick={() => void remove()}>{busy ? '删除中…' : '确认删除'}</button></div>
  </Modal>;
}
