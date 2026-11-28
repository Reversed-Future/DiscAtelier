import { EditionIdentity } from './EditionIdentity';
import { EditionDetails, EditionTabs } from './EditionPanels';
import { editionIssue, useEditionNavigation } from './editionNavigation';
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
import { DiscogsReplacement } from './DiscogsReplacement';
import { discogs, type ImportPreview } from '../metadata/gateway';
import { useContentDraft } from './useContentDraft';
import { Select } from '../ui/Select';
import { netease, type LinkedMusicAlbum } from '../integrations/gateway';

export function EditEdition({ item, categories, carriers, onClose, onSaved }: {
  item: LibraryCopy; categories: Descriptor[]; carriers: Descriptor[]; onClose(): void; onSaved(categoryId: string): void;
}) {
  const navigation = useEditionNavigation();
  const page = navigation.page;
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
  const content = useContentDraft(item.editionId, sourceOpen || page === 'discs' || (page === 'content' && edition.categoryId !== 'video'));
  const [cover, setCover] = useState<CoverChange>({ action: 'keep' });
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [model, setModel] = useModelDraft();
  const [modelActionsHost, setModelActionsHost] = useState<HTMLDivElement | null>(null);
  const [error, setError] = useState('');
  const attempt = useRef({ payload: '', requestId: crypto.randomUUID() });
  const locked = busy || reading || !videoLoaded;
  const isVideo = edition.categoryId === 'video';
  const identity = <EditionFields value={edition} onChange={setEdition} categories={categories}/>;
  return <Modal title={isVideo ? '编辑影片版本' : '编辑音乐版本'} onClose={onClose} busy={busy || reading} wide className="editor-panel">
    <EditionTabs page={page} video={isVideo} disabled={locked} onChange={next => { setError(''); navigation.navigate(next); }}/>
    <form className="editor-form" ref={navigation.form} onChange={navigation.clear} noValidate onSubmit={async event => {
      const dialog = event.currentTarget.closest('dialog');
      event.preventDefault(); if (busy || reading || !videoLoaded || content.pending) return;
      const issue = editionIssue(edition, carriers, videoDraft);
      if (issue) { navigation.report(issue); return; }
      const payload = measureSync('draft_encode', () => JSON.stringify({ edition, cover, model, videoDraft, content: content.changed, sourceToken: sourceDraft?.token }));
      if (payload !== attempt.current.payload) attempt.current = { payload, requestId: crypto.randomUUID() };
      setBusy(true); setError('');
      try {
        const request = { requestId: attempt.current.requestId, editionId: item.editionId, expectedRevision: item.editionRevision, edition, cover, model: modelChangeRequest(model) };
        await measureAsync('save_ipc', () => sourceDraft && content.value ? discogs.updateEdition(request, sourceDraft.token, content.value, edition.categoryId === 'video' ? videoDraft : null) : edition.categoryId === 'video' ? video.update(request, videoDraft, content.changed) : library.updateEdition(request, content.changed));
        onSaved(edition.categoryId);
        dialog?.setAttribute('data-closing', 'true'); await leave(dialog); onClose();
      } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
    }}>
      <fieldset key={page} disabled={locked}>
      {page === 'edition' ? <>
        {item.editionCopyCount > 1 && <p className="form-note">本版本共 {item.editionCopyCount} 套，资料、封面与模型会同步更新。</p>}
        {isVideo ? <VideoFields value={videoDraft} onChange={setVideoDraft} edition={edition} onEdition={setEdition} onCover={setCover} cover={cover} assetId={item.coverAssetId} onBusy={setReading}>{identity}</VideoFields>
        : <EditionIdentity artwork={<>
        {albums.length > 1 && <label className="cover-album-choice">网易云封面来源<Select label="网易云封面来源" value={coverAlbum} options={albums.map(a => ({id:String(a.album.albumId),label:a.album.title}))} onChange={setCoverAlbum}/></label>}
        <CoverField edition={edition} assetId={item.coverAssetId} value={cover} onChange={setCover} onBusy={setReading}
          remoteCover={coverAlbum ? {label: '使用网易云封面', load: () => netease.albumCover(Number(coverAlbum))} : undefined}/>
        <div className="edition-import-tools"><h3>导入资料</h3>
          <button type="button" className="text-button" onClick={() => setSourceOpen(true)}>更换 Discogs 资料</button>
          {sourceDraft && <span className="form-note">Discogs #{sourceDraft.source.externalId}</span>}
        </div></>}>{identity}</EditionIdentity>}
      </> : page === 'discs' || page === 'content' ? <EditionDetails page={page} edition={edition} carriers={carriers} onEdition={setEdition}
        content={content.value} onContent={content.change} metadata={videoDraft} onMetadata={setVideoDraft} onBusy={setReading} focusDisc={navigation.target.disc} focusWork={navigation.target.work}/>
        : <ModelField value={model} title={item.modelTitle} assetId={item.modelAssetId} actionsHost={modelActionsHost} onChange={setModel} onBusy={setReading} disabled={locked}/>}
      </fieldset>
      <p id="edition-validation" className="form-error" role="alert">{navigation.issue?.message || error || content.error}</p>
      <footer className="form-footer"><div className="model-footer-actions" ref={setModelActionsHost}/><button type="submit" className="solid-button" disabled={busy || reading || !videoLoaded || content.pending}>{busy ? '保存中' : '保存更改'}</button></footer>
    </form>
    {sourceOpen && edition.categoryId !== 'video' && <DiscogsReplacement editionId={item.editionId} edition={edition}
      onClose={() => setSourceOpen(false)} onApply={value => {
        setEdition(value.preview.edition); content.change(value.content); setSourceDraft(value.preview);
        if (value.preview.cover) setCover({ action: 'replace', dataUrl: value.preview.cover });
        setSourceOpen(false);
      }}/>}
  </Modal>;
}
