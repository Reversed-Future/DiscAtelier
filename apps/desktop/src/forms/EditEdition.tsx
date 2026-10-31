import { partsError } from '../video/parts';
import { video, emptyVideo } from '../video/gateway';
import { VideoFields } from '../video/VideoFields';
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
import { ContentEditor } from './ContentEditor';
import { DiscogsReplacement } from './DiscogsReplacement';
import { discogs, type ImportPreview } from '../metadata/gateway';
import { useContentDraft } from './useContentDraft';
import { Select } from '../ui/Select';
import { netease, type LinkedMusicAlbum } from '../integrations/gateway';

export function EditEdition({ item, categories, carriers, onClose, onSaved }: {
  item: LibraryCopy; categories: Descriptor[]; carriers: Descriptor[]; onClose(): void; onSaved(categoryId: string): void;
}) {
  const [page, setPage] = useState<'edition' | 'content' | 'model'>('edition');
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceDraft, setSourceDraft] = useState<ImportPreview | null>(null);
  const [videoDraft, setVideoDraft] = useState(emptyVideo);
  const [videoLoaded, setVideoLoaded] = useState(item.edition.categoryId !== 'video');
  useEffect(() => {
    let live = true;
    if (item.edition.categoryId === 'video') void video.metadata(item.editionId).then(value => { if (live) { setVideoDraft(value || emptyVideo()); setVideoLoaded(true); } }).catch(cause => { if (live) setError(errorMessage(cause)); });
    return () => { live = false; };
  }, [item.editionId]);
  const [albums, setAlbums] = useState<LinkedMusicAlbum[]>([]), [coverAlbum, setCoverAlbum] = useState('');
  useEffect(() => {
    let live = true;
    if (item.edition.categoryId === 'music') void netease.albums(item.editionId).then(value => { if (live) { setAlbums(value); setCoverAlbum(String(value[0]?.album.albumId || '')); } }).catch(cause => { if (live) setError(errorMessage(cause)); });
    return () => { live = false; };
  }, [item.editionId]);
  const [edition, setEdition] = useState(item.edition);
  const content = useContentDraft(item.editionId, sourceOpen || (page === 'content' && edition.categoryId !== 'video'));
  const [cover, setCover] = useState<CoverChange>({ action: 'keep' });
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [model, setModel] = useModelDraft();
  const [modelActionsHost, setModelActionsHost] = useState<HTMLDivElement | null>(null);
  const [error, setError] = useState('');
  const attempt = useRef({ payload: '', requestId: crypto.randomUUID() });
  return <Modal title="编辑版本" onClose={onClose} busy={busy || reading} wide className="editor-panel">
    <nav className="detail-tabs editor-page-tabs" aria-label="编辑内容">
      <button type="button" className={page === 'edition' ? 'active' : ''} disabled={busy || reading} onClick={() => setPage('edition')}>版本</button>
      <button type="button" className={page === 'content' ? 'active' : ''} disabled={busy || reading} onClick={() => setPage('content')}>资料</button>
      <button type="button" className={page === 'model' ? 'active' : ''} disabled={busy || reading} onClick={() => setPage('model')}>模型</button>
    </nav>
    <form className="editor-form" noValidate onSubmit={async event => {
      const dialog = event.currentTarget.closest('dialog');
      event.preventDefault(); if (busy || reading || !videoLoaded || content.pending) return;
      if (edition.categoryId === 'video' && partsError(videoDraft)) {setError(partsError(videoDraft));return;}
      const payload = measureSync('draft_encode', () => JSON.stringify({ edition, cover, model, videoDraft, content: content.changed, sourceToken: sourceDraft?.token }));
      if (payload !== attempt.current.payload) attempt.current = { payload, requestId: crypto.randomUUID() };
      setBusy(true); setError('');
      try {
        const request = { requestId: attempt.current.requestId, editionId: item.editionId, expectedRevision: item.editionRevision, edition, cover, model: modelChangeRequest(model) };
        await measureAsync('save_ipc', () => sourceDraft && content.value ? discogs.updateEdition(request, sourceDraft.token, content.value, edition.categoryId === 'video' ? videoDraft : null) : edition.categoryId === 'video' ? video.update(request, videoDraft) : library.updateEdition(request, content.changed));
        onSaved(edition.categoryId);
        dialog?.setAttribute('data-closing', 'true'); await leave(dialog); onClose();
      } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
    }}>
      {page === 'edition' ? <>
      <div className="metadata-toolbar"><button type="button" className="text-button" disabled={busy || reading} onClick={() => setSourceOpen(true)}>更换 Discogs 资料</button>
        {sourceDraft && <span className="form-note">已选择 Discogs #{sourceDraft.source.externalId} · 保存后生效</span>}
      </div>
      {item.editionCopyCount > 1 && <p className="form-note">本版本共 {item.editionCopyCount} 套，资料、封面与模型会同步更新。</p>}
      <fieldset disabled={busy || reading || !videoLoaded}>
        {edition.categoryId === 'video' && videoLoaded && <VideoFields value={videoDraft} onChange={setVideoDraft} edition={edition} onEdition={setEdition} onCover={setCover} cover={cover} assetId={item.coverAssetId} onBusy={setReading}/>}
        {albums.length > 1 && <label className="cover-album-choice">网易云封面来源<Select label="网易云封面来源" value={coverAlbum} options={albums.map(a => ({id:String(a.album.albumId),label:a.album.title}))} onChange={setCoverAlbum}/></label>}
        {edition.categoryId !== 'video' && <CoverField edition={edition} assetId={item.coverAssetId} value={cover} onChange={setCover} onBusy={setReading}
          remoteCover={item.edition.categoryId === 'music' ? { label: '使用网易云封面', load: async () => {
            const album = albums.find(a => String(a.album.albumId) === coverAlbum)?.album ?? (await netease.albums(item.editionId))[0]?.album;
            if (!album) throw new Error('请先在网易云资料中关联专辑。');
            return netease.albumCover(album.albumId);
          } } : videoDraft.work ? { label: '使用作品封面', load: () => video.cover(videoDraft.work!) } : undefined}/>}
        <EditionFields value={edition} onChange={setEdition} categories={categories} carriers={carriers}/>
      </fieldset>
      </> : page === 'model' ? <fieldset disabled={busy || reading}>
        <ModelField value={model} title={item.modelTitle} assetId={item.modelAssetId} actionsHost={modelActionsHost} onChange={setModel} onBusy={setReading} disabled={busy || reading}/>
      </fieldset> : <fieldset disabled={busy || reading || !videoLoaded}>
        <ContentEditor edition={edition} content={content.value} onContent={content.change}
          metadata={videoDraft} onMetadata={setVideoDraft} onBusy={setReading}/>
      </fieldset>}
      <p className="form-error" role="alert">{error || content.error}</p>
      <footer className="form-footer"><div className="model-footer-actions" ref={setModelActionsHost}/><button type="submit" className="solid-button" disabled={busy || reading || !videoLoaded || content.pending}>{busy ? '保存中' : page === 'content' ? '保存资料' : '保存版本'}</button></footer>
    </form>
    {sourceOpen && <DiscogsReplacement editionId={item.editionId} edition={edition} categories={categories} carriers={carriers}
      onClose={() => setSourceOpen(false)} onApply={value => {
        setEdition(value.preview.edition); content.change(value.content); setSourceDraft(value.preview);
        if (value.preview.cover) setCover({ action: 'replace', dataUrl: value.preview.cover });
        setSourceOpen(false);
      }}/>}
  </Modal>;
}
