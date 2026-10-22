import { partsError } from '../video/parts';
import { video, emptyVideo } from '../video/gateway';
import { VideoFields } from '../video/VideoFields';
import { useEffect, useRef, useState } from 'react';
import type { CoverChange, Descriptor, EditionDraft, LibraryCopy } from '../library/types';
import { emptyCopy } from '../library/types';
import { library, errorMessage } from '../library/gateway';
import { parsePrice } from '../library/money';
import { Modal } from '../ui/Modal';
import { enter } from '../ui/motion';
import { PurchaseFields } from './PurchaseFields';
import { EditionFields } from './EditionFields';
import { CoverField } from './CoverField';
import { useModelDraft } from '../models/useModelDraft';
import { ModelField } from '../models/ModelField';
import { discogs, type ImportPreview } from '../metadata/gateway';
import type { ReleaseTrack } from '../metadata/gateway';
import { netease, type MusicSupplement } from '../integrations/gateway';
import { ImportMusicField } from '../integrations/ImportMusicField';
import { NeteaseBrowser } from '../integrations/NeteaseBrowser';

export function AddCopy({ categoryId, categories, carriers, existing: suppliedExisting, imported, importTracks = [], onBack, onDiscogs, onClose, onSaved }: {
  categoryId: string; categories: Descriptor[]; carriers: Descriptor[]; existing?: LibraryCopy; imported?: ImportPreview;
  importTracks?: ReleaseTrack[];
  onBack?(): void;
  onDiscogs?(): void;
  onClose(): void; onSaved(id: string, categoryId: string): Promise<void>;
}) {
  const existing = imported?.existing || suppliedExisting;
  const [edition, setEdition] = useState<EditionDraft>(existing?.edition || imported?.edition || {
    categoryId, title: '', creator: '', editionLabel: '', barcode: '', catalogNumber: '', media: [{ carrierId: categoryId === 'music' ? 'cd' : 'bd', label: '' }],
  });
  const [videoDraft, setVideoDraft] = useState(emptyVideo);
  const [copy, setCopy] = useState(emptyCopy);
  const [music, setMusic] = useState<MusicSupplement | null>(null);
  const [musicOpen, setMusicOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [tab, setTab] = useState(existing ? 'purchase' : 'edition');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [model, setModel] = useModelDraft();
  const [cover, setCover] = useState<CoverChange>(() => imported?.cover
    ? { action: 'replace', dataUrl: imported.cover } : { action: 'keep' });
  const attempt = useRef({ payload: '', requestId: crypto.randomUUID() });
  const automaticCover = useRef<string | null>(null);
  const fields = useRef<HTMLFieldSetElement>(null);
  useEffect(() => { fields.current?.scrollTo(0, 0); enter(fields.current, 0); }, [tab]);
  async function selectMusic(album: MusicSupplement) {
    setError('');
    if (!imported) {
      setEdition(current => ({ ...current, title: album.title, creator: album.artists.join(' / ') }));
      if (cover.action === 'keep' || (cover.action === 'replace' && cover.dataUrl === automaticCover.current)) {
        try {
          const dataUrl = await netease.albumCover(album.albumId);
          automaticCover.current = dataUrl;
          setCover({ action: 'replace', dataUrl });
        } catch (cause) { setError(`资料已读取，封面未获取：${errorMessage(cause)}`); }
      }
    }
    setMusic(album); setMusicOpen(false);
  }
  return <><Modal title={existing ? '再收一套' : '添加收藏'} onClose={onClose} busy={busy || reading} wide className={imported ? 'metadata-browser-panel' : ''}>
    <form className="editor-form" noValidate onSubmit={async event => {
      event.preventDefault();
      if (busy || reading) return;
      if (tab === 'edition') {
        if (!edition.title.trim()) { setError('请填写名称'); return; }
        if (edition.media.some(medium => !carriers.some(carrier => carrier.id === medium.carrierId))) { setError('请选择每张盘片的载体'); return; }
        setError(''); setTab('purchase'); return;
      }
      try {
        const purchase = { ...copy, amountMinor: parsePrice(amount, copy.currency) };
        if (edition.categoryId === 'video' && !existing && partsError(videoDraft)) throw new Error(partsError(videoDraft));
        const coverData = !existing && cover.action === 'replace' ? cover.dataUrl : null;
        const modelToken = !existing && model.action === 'prepared' ? model.token : null;
        const neteaseAlbumId = edition.categoryId === 'music' ? music?.albumId || null : null;
        const payload = JSON.stringify({ edition, purchase, coverData, modelToken, existingEditionId: existing?.editionId, token: imported?.token, neteaseAlbumId, videoDraft });
        if (payload !== attempt.current.payload) attempt.current = { payload, requestId: crypto.randomUUID() };
        setBusy(true); setError('');
        const manualRequest = { requestId: attempt.current.requestId, edition: existing ? null : edition, existingEditionId: existing?.editionId || null, copy: purchase, cover: coverData, model: null, modelToken };
        const id = imported
          ? await discogs.importCopy({ requestId: attempt.current.requestId, token: imported.token, edition, copy: purchase, cover: coverData, model: null, modelToken,
            existingEditionId: existing?.editionId || null, expectedRevision: existing?.editionRevision || null, neteaseAlbumId })
          : edition.categoryId === 'video' && !existing ? await video.create(manualRequest, videoDraft)
          : neteaseAlbumId && !existing ? await netease.createCopy(manualRequest, neteaseAlbumId) : await library.create(manualRequest);
        await onSaved(id, edition.categoryId);
        onClose();
      } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
    }}>
      {onBack && <button type="button" className="text-button import-back" onClick={onBack} disabled={busy || reading}>返回版本</button>}
      {onDiscogs && <button type="button" className="text-button import-back" disabled={busy || reading} onClick={onDiscogs}>从 Discogs 导入</button>}
      {!existing && <nav className="detail-tabs" aria-label="添加步骤">
        <button type="button" className={tab === 'edition' ? 'active' : ''} onClick={() => setTab('edition')} disabled={busy || reading}>版本</button>
        <button type="button" className={tab === 'purchase' ? 'active' : ''} onClick={() => {
          if (!edition.title.trim()) setError('请填写名称');
          else if (edition.media.some(medium => !carriers.some(carrier => carrier.id === medium.carrierId))) setError('请选择每张盘片的载体');
          else { setTab('purchase'); setError(''); }
        }} disabled={busy || reading}>购入</button>
      </nav>}
      {existing && <p className="existing-edition">{edition.title}<span>{edition.editionLabel}</span>{imported && <span>已收藏 {existing.editionCopyCount} 套</span>}</p>}
      <fieldset disabled={busy || reading} ref={fields}>
      {tab === 'edition' ? <>
        {!imported && edition.categoryId === 'video' && <VideoFields value={videoDraft} onChange={setVideoDraft} edition={edition} onEdition={setEdition} onCover={setCover} cover={cover} onBusy={setReading}/>}
        {!imported && edition.categoryId === 'music' && <ImportMusicField manual tracks={[]} value={music} onChange={setMusic} onPick={() => setMusicOpen(true)}/>}
        {(imported || edition.categoryId !== 'video') && <CoverField edition={edition} value={cover} onChange={setCover} onBusy={setReading}
          remoteCover={music && edition.categoryId === 'music' ? { label: '使用网易云封面', load: () => netease.albumCover(music.albumId) } : edition.categoryId === 'video' && videoDraft.work ? { label: '使用作品封面', load: () => video.cover(videoDraft.work!) } : undefined}/>}
        <ModelField value={model} onChange={setModel} onBusy={setReading} disabled={busy || reading}/>
        {imported && edition.categoryId === 'music' && <ImportMusicField tracks={importTracks} value={music} onChange={setMusic} onPick={() => setMusicOpen(true)}/>}
        <EditionFields value={edition} onChange={setEdition} categories={categories} carriers={carriers}/>
      </> : <PurchaseFields value={copy} amount={amount} setAmount={setAmount} onChange={setCopy} title={edition.title} creator={edition.creator} onBusy={setReading}/>}
      </fieldset>
      <p className="form-error" role="alert">{error}</p>
      <footer className="form-footer"><button type="submit" className="solid-button" disabled={busy || reading}>{busy ? '保存中' : tab === 'edition' ? '下一步' : '加入收藏'}</button></footer>
    </form>
  </Modal>{musicOpen && <NeteaseBrowser initialQuery={`${edition.title} ${edition.creator}`.trim()} autoSearch={!!edition.title.trim()} onClose={() => setMusicOpen(false)} confirmLabel="使用此资料" onConfirm={selectMusic}/>}</>;
}
