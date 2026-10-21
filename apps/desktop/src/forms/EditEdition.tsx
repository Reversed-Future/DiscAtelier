import { leave } from '../ui/motion';
import { measureAsync, measureSync } from '../models/timing';
import { useEffect, useRef, useState } from 'react';
import type { CoverChange, Descriptor, LibraryCopy } from '../library/types';
import { library, errorMessage } from '../library/gateway';
import { Modal } from '../ui/Modal';
import { CoverField } from './CoverField';
import { useModelDraft } from '../models/useModelDraft';
import { ModelField } from '../models/ModelField';
import { modelChangeRequest } from '../models/assets';
import { EditionFields } from './EditionFields';
import { Select } from '../ui/Select';
import { netease, type LinkedMusicAlbum } from '../integrations/gateway';

export function EditEdition({ item, categories, carriers, onClose, onSaved }: {
  item: LibraryCopy; categories: Descriptor[]; carriers: Descriptor[]; onClose(): void; onSaved(categoryId: string): void;
}) {
  const [albums, setAlbums] = useState<LinkedMusicAlbum[]>([]), [coverAlbum, setCoverAlbum] = useState('');
  useEffect(() => {
    let live = true;
    if (item.edition.categoryId === 'music') void netease.albums(item.editionId).then(value => { if (live) { setAlbums(value); setCoverAlbum(String(value[0]?.album.albumId || '')); } }).catch(cause => { if (live) setError(errorMessage(cause)); });
    return () => { live = false; };
  }, [item.editionId]);
  const [edition, setEdition] = useState(item.edition);
  const [cover, setCover] = useState<CoverChange>({ action: 'keep' });
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [model, setModel] = useModelDraft();
  const [error, setError] = useState('');
  const attempt = useRef({ payload: '', requestId: crypto.randomUUID() });
  return <Modal title="编辑版本" onClose={onClose} busy={busy || reading} wide>
    <form className="editor-form" noValidate onSubmit={async event => {
      const dialog = event.currentTarget.closest('dialog');
      event.preventDefault(); if (busy || reading) return;
      const payload = measureSync('draft_encode', () => JSON.stringify({ edition, cover, model }));
      if (payload !== attempt.current.payload) attempt.current = { payload, requestId: crypto.randomUUID() };
      setBusy(true); setError('');
      try {
        await measureAsync('save_ipc', () => library.updateEdition({ requestId: attempt.current.requestId, editionId: item.editionId, expectedRevision: item.editionRevision, edition, cover, model: modelChangeRequest(model) }));
        onSaved(edition.categoryId);
        dialog?.setAttribute('data-closing', 'true'); await leave(dialog); onClose();
      } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
    }}>
      {item.editionCopyCount > 1 && <p className="form-note">本版本共 {item.editionCopyCount} 套，资料、封面与模型会同步更新。</p>}
      <fieldset disabled={busy || reading}>
        {albums.length > 1 && <label className="cover-album-choice">网易云封面来源<Select label="网易云封面来源" value={coverAlbum} options={albums.map(a => ({id:String(a.album.albumId),label:a.album.title}))} onChange={setCoverAlbum}/></label>}
        <CoverField edition={edition} assetId={item.coverAssetId} value={cover} onChange={setCover} onBusy={setReading}
          remoteCover={item.edition.categoryId === 'music' ? { label: '使用网易云封面', load: async () => {
            const album = albums.find(a => String(a.album.albumId) === coverAlbum)?.album ?? (await netease.albums(item.editionId))[0]?.album;
            if (!album) throw new Error('请先在网易云资料中关联专辑。');
            return netease.albumCover(album.albumId);
          } } : undefined}/>
        <ModelField value={model} title={item.modelTitle} onChange={setModel} onBusy={setReading} disabled={busy || reading}/>
        <EditionFields value={edition} onChange={setEdition} categories={categories} carriers={carriers}/>
      </fieldset>
      <p className="form-error" role="alert">{error}</p>
      <footer className="form-footer"><button type="submit" className="solid-button" disabled={busy || reading}>{busy ? '保存中' : '保存版本'}</button></footer>
    </form>
  </Modal>;
}
