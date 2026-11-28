import { EditionIdentity } from './EditionIdentity';
import { EditionDetails, EditionTabs } from './EditionPanels';
import { editionIssue, useEditionNavigation, type EditorPage } from './editionNavigation';
import { MobileReceive } from '../mobile/MobileReceive';
import { DiscogsReplacement } from './DiscogsReplacement';
import { video, emptyVideo } from '../video/gateway';
import { emptyEditionContent } from './useContentDraft';
import { VideoFields } from '../video/VideoFields';
import { useRef, useState } from 'react';
import type { CoverChange, Descriptor, EditionDraft, LibraryCopy } from '../library/types';
import { emptyCopy } from '../library/types';
import { library, errorMessage } from '../library/gateway';
import { parsePrice } from '../library/money';
import { Modal } from '../ui/Modal';
import { PurchaseFields } from './PurchaseFields';
import { BundlePicker, applyBundlePurchase } from './BundlePicker';
import { EditionFields } from './EditionFields';
import { CoverField } from './CoverField';
import { useModelDraft } from '../models/useModelDraft';
import { ModelField } from '../models/ModelField';
import { discogs, type ImportPreview } from '../metadata/gateway';
import { netease, type MusicSupplement } from '../integrations/gateway';
import { albumRows } from '../integrations/albumTracks';
import { NeteaseBrowser } from '../integrations/NeteaseBrowser';

export function AddCopy({ categoryId, categories, carriers, existing: suppliedExisting, onClose, onSaved }: {
  categoryId: string; categories: Descriptor[]; carriers: Descriptor[]; existing?: LibraryCopy;
  onClose(): void; onSaved(id: string, categoryId: string): Promise<void>;
}) {
  const [imported, setImported] = useState<ImportPreview | null>(null);
  const [duplicate, setDuplicate] = useState<ImportPreview | null>(null);
  const [scanning, setScanning] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const existing = duplicate?.existing || suppliedExisting;
  const navigation = useEditionNavigation(existing ? 'purchase' : 'edition');
  const tab = navigation.page;
  const [edition, setEdition] = useState<EditionDraft>(suppliedExisting?.edition || {
    categoryId,
    title: '',
    creator: '',
    editionLabel: '',
    barcode: '',
    catalogNumber: '',
    media: [{ carrierId: categoryId === 'music' ? 'cd' : 'bd', label: '' }],
  });
  const [discContent, setDiscContent] = useState(emptyEditionContent);
  const [videoDraft, setVideoDraft] = useState(emptyVideo);
  const [copy, setCopy] = useState(emptyCopy);
  const [music, setMusic] = useState<MusicSupplement | null>(null);
  const [musicOpen, setMusicOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [bundle, setBundle] = useState<LibraryCopy[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [model, setModel] = useModelDraft();
  const [modelActionsHost, setModelActionsHost] = useState<HTMLDivElement | null>(null);
  const [cover, setCover] = useState<CoverChange>({ action: 'keep' });
  const [coverWarning, setCoverWarning] = useState('');
  const [retryingCover, setRetryingCover] = useState(false);
  const attempt = useRef({ payload: '', requestId: crypto.randomUUID() });
  const seededTracks = useRef(discContent.tracks);
  const automaticCover = useRef<string | null>(null);
  const locked = busy || reading || retryingCover;
  const displayEdition = existing?.edition || edition;
  const isVideo = edition.categoryId === 'video';
  function navigate(next: EditorPage) {
    setError('');
    const issue = next === 'purchase' && !existing && editionIssue(edition, carriers, videoDraft);
    if (issue) navigation.report(issue); else navigation.navigate(next);
  }
  async function retryCover() {
    if (!imported || retryingCover) return;
    setRetryingCover(true); setCoverWarning(''); setError('');
    try {
      const dataUrl = await discogs.retryCover(Number(imported.source.externalId));
      if (dataUrl) setCover({ action: 'replace', dataUrl });
      else setCoverWarning('这个发行没有可用封面，可手动选择本地图片。');
    } catch (cause) { setCoverWarning(errorMessage(cause)); }
    finally { setRetryingCover(false); }
  }
  async function selectMusic(album: MusicSupplement) {
    setError('');
    setMusic(album); setMusicOpen(false);
    if (!imported) {
      if (!discContent.tracks.length || discContent.tracks === seededTracks.current) {
        const tracks = albumRows({album, legacyPositions: true});
        seededTracks.current = tracks;
        setDiscContent(current => ({ ...current, tracks }));
      }
      setEdition(current => ({ ...current, title: album.title, creator: album.artists.join(' / ') }));
      if (cover.action === 'keep' || (cover.action === 'replace' && cover.dataUrl === automaticCover.current)) {
        setReading(true);
        try {
          const dataUrl = await netease.albumCover(album.albumId);
          automaticCover.current = dataUrl;
          setCover({ action: 'replace', dataUrl });
        } catch (cause) { setError(`资料已读取，封面未获取：${errorMessage(cause)}`); } finally { setReading(false); }
      }
    }
  }
  const identity = <EditionFields value={edition} onChange={setEdition} categories={categories}/>;
  return <><Modal title={existing ? '再收一套' : isVideo ? '添加影片版本' : '添加音乐版本'} onClose={onClose} busy={locked} wide className="editor-panel">
    {!existing && <EditionTabs page={tab} video={isVideo} purchase disabled={locked} onChange={navigate}/>}
    <form className="editor-form" ref={navigation.form} onChange={navigation.clear} noValidate onSubmit={async event => {
      event.preventDefault();
      if (locked) return;
      if (tab !== 'purchase') { navigate('purchase'); return; }
      const issue = !existing && editionIssue(edition, carriers, videoDraft);
      if (issue) { navigation.report(issue); return; }
      let amountMinor;
      try { amountMinor = parsePrice(amount, copy.currency); }
      catch (cause) { navigation.report({page: 'purchase', selector: 'input[aria-label="价格"]', message: errorMessage(cause)}); return; }
      if (copy.purchaseUrl) {
        let url;
        try { url = new URL(copy.purchaseUrl); } catch { /* reported below */ }
        if (!url || !['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
          navigation.report({page: 'purchase', selector: 'input[aria-label="购买链接"]', message: '购买链接须为不含登录凭据的 HTTP 或 HTTPS 地址'}); return;
        }
      }
      try {
        const purchase = { ...copy, amountMinor };
        const coverData = !existing && cover.action === 'replace' ? cover.dataUrl : null;
        const modelToken = !existing && model.action === 'prepared' ? model.token : null;
        const neteaseAlbumId = !existing && !isVideo ? music?.albumId || null : null;
        const source = duplicate || (!isVideo ? imported : null);
        const payload = JSON.stringify({ edition, purchase, coverData, modelToken, existingEditionId: existing?.editionId, token: source?.token, neteaseAlbumId, videoDraft, discContent, bundle: bundle.map(entry => entry.id) });
        if (payload !== attempt.current.payload) attempt.current = { payload, requestId: crypto.randomUUID() };
        setBusy(true); setError('');
        const manualRequest = { requestId: attempt.current.requestId, edition: existing ? null : edition, existingEditionId: existing?.editionId || null, copy: purchase, cover: coverData, model: null, modelToken };
        const id = source
          ? await discogs.importCopy({ requestId: attempt.current.requestId, token: source.token, edition: displayEdition, copy: purchase, cover: coverData, model: null, modelToken,
            existingEditionId: existing?.editionId || null, expectedRevision: existing?.editionRevision || null, neteaseAlbumId }, existing ? null : discContent)
          : existing ? await library.create(manualRequest)
          : isVideo ? await video.create(manualRequest, videoDraft, discContent.tracks.length ? discContent : null)
          : await netease.createCopy(manualRequest, neteaseAlbumId, discContent);
        await applyBundlePurchase(purchase, bundle);
        await onSaved(id, displayEdition.categoryId);
        onClose();
      } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
    }}>
      {existing && <p className="existing-edition">{displayEdition.title}<span>{displayEdition.editionLabel}</span>
        {duplicate && <span>已收藏 {existing.editionCopyCount} 套</span>}
        {duplicate && <button type="button" className="text-button" disabled={locked} onClick={() => { setDuplicate(null); navigate('edition'); }}>返回版本信息</button>}</p>}
      {imported && cover.action !== 'replace' && (coverWarning || retryingCover) && <p className="form-note cover-retry-note" role="status">
        {retryingCover ? <><span className="button-spinner" aria-hidden="true"/>正在重试封面…</> : <>
          <span>{coverWarning}</span><button type="button" className="text-button" onClick={() => void retryCover()}>重试封面</button>
        </>}
      </p>}
      <fieldset key={tab} disabled={locked}>
      {tab === 'edition' ? isVideo
        ? <VideoFields value={videoDraft} onChange={setVideoDraft} edition={edition} onEdition={setEdition} cover={cover} onCover={setCover} onBusy={setReading}>{identity}</VideoFields>
        : <EditionIdentity artwork={<>
          <CoverField edition={edition} value={cover} onChange={setCover} onBusy={setReading} remoteCover={music ? {label: '使用网易云封面', load: () => netease.albumCover(music.albumId)} : undefined}/>
          <div className="edition-import-tools"><h3>导入资料</h3>
            <button type="button" className="text-button" onClick={() => setSourceOpen(true)}>{imported ? '更换 Discogs 资料' : '从 Discogs 导入'}</button>
            <button type="button" className="text-button" onClick={() => setMusicOpen(true)}>{music ? '更换网易云专辑' : '从网易云导入'}</button>
            <button type="button" className="text-button" onClick={() => setScanning(true)}>手机扫条码</button>
            {music && <><span className="form-note">{music.title}</span><button type="button" className="text-button" onClick={() => setMusic(null)}>解除网易云关联</button></>}
          </div></>}>{identity}</EditionIdentity>
        : tab === 'discs' || tab === 'content' ? <EditionDetails page={tab} edition={edition} carriers={carriers} onEdition={setEdition}
          content={discContent} onContent={setDiscContent} metadata={videoDraft} onMetadata={setVideoDraft} onBusy={setReading} focusDisc={navigation.target.disc} focusWork={navigation.target.work}/>
        : tab === 'model' ? <ModelField value={model} actionsHost={modelActionsHost} onChange={setModel} onBusy={setReading} disabled={busy || reading}/> : <PurchaseFields value={copy} amount={amount} setAmount={setAmount} onChange={setCopy} title={displayEdition.title} creator={displayEdition.creator} onBusy={setReading}
        afterDate={<BundlePicker value={bundle} onChange={setBundle}/>}/>}
      </fieldset>
      <p id="edition-validation" className="form-error" role="alert">{navigation.issue?.message || error}</p>
      <footer className="form-footer"><div className="model-footer-actions" ref={setModelActionsHost}/><button type="submit" className="solid-button" disabled={busy || reading || retryingCover}>{busy ? '保存中' : tab === 'purchase' ? '加入收藏' : '填写购入信息'}</button></footer>
    </form>
  </Modal>
  {sourceOpen && <DiscogsReplacement edition={edition} onClose={() => setSourceOpen(false)} onApply={({preview, content}) => {
    if (preview.existing) { setDuplicate(preview); navigation.navigate('purchase'); }
    else {
      setImported(preview); setEdition(preview.edition); setDiscContent(content);
      if (preview.cover) setCover({action: 'replace', dataUrl: preview.cover});
      setCoverWarning(preview.coverError || ''); navigate('edition');
    }
    setSourceOpen(false);
  }}/>}
  {scanning && <MobileReceive mode="barcode" onClose={() => setScanning(false)} onReceive={value => {
    if (value.kind === 'barcode') setEdition(current => ({...current, barcode: value.value}));
  }}/>}
  {musicOpen && <NeteaseBrowser initialQuery={`${edition.title} ${edition.creator}`.trim()} autoSearch={!!edition.title.trim()} onClose={() => setMusicOpen(false)} confirmLabel="使用此资料" onConfirm={selectMusic}/>}</>;
}
