import type { Descriptor, EditionDraft } from '../library/types';
import type { EditionContent } from '../metadata/gateway';
import type { VideoMetadata } from '../video/gateway';
import { VideoDiscEditor } from '../video/VideoDiscEditor';
import { VideoPartsEditor } from '../video/VideoPartsEditor';
import { VideoSourcesEditor } from '../video/VideoSourcesEditor';
import { MusicEditor, VideoEditor } from './ContentEditor';
import { MusicMediaFields } from './MusicMediaFields';
import type { EditorPage } from './editionNavigation';

export function EditionTabs({page, video, purchase, disabled, onChange}: {
  page: EditorPage; video: boolean; purchase?: boolean; disabled: boolean; onChange(page: EditorPage): void;
}) {
  const tabs: [EditorPage, string][] = [['edition', '版本信息'], ['discs', video ? '实体碟片' : '碟片与曲目'],
    ['content', video ? '作品资料' : '专辑资料'], ['model', '模型']];
  if (purchase) tabs.push(['purchase', '购入信息']);
  return <nav className="detail-tabs editor-page-tabs" aria-label="版本录入">{tabs.map(([id, label]) =>
    <button key={id} type="button" disabled={disabled} aria-current={page === id ? 'page' : undefined}
      className={page === id ? 'active' : ''} onClick={() => onChange(id)}>{label}</button>)}</nav>;
}

export function EditionDetails({page, edition, onEdition, carriers, content, onContent, metadata, onMetadata, onBusy, focusDisc, focusWork}: {
  page: 'discs' | 'content'; edition: EditionDraft; onEdition(value: EditionDraft): void; carriers: Descriptor[];
  content: EditionContent | null; onContent(value: EditionContent): void; metadata: VideoMetadata;
  onMetadata(value: VideoMetadata): void; onBusy(value: boolean): void; focusDisc?: number; focusWork?: number;
}) {
  if (edition.categoryId === 'video' && page === 'content') return <>
    <VideoSourcesEditor value={metadata} initialQuery={edition.title} onChange={onMetadata}
      onFirstWork={work => { if (!edition.title.trim()) onEdition({...edition, title: work.title}); }}/>
    <VideoPartsEditor value={metadata} onChange={onMetadata}/>
    <VideoEditor key={focusWork} initialWork={focusWork} metadata={metadata} setMetadata={onMetadata} onBusy={onBusy}/>
  </>;
  if (!content) return <p className="utility-copy">正在读取资料…</p>;
  if (edition.categoryId === 'video') return <VideoDiscEditor key={focusDisc} focusDisc={focusDisc} edition={edition} carriers={carriers} content={content} onEdition={onEdition} onContent={onContent}/>;
  return <>{page === 'discs' && <MusicMediaFields value={edition} onChange={onEdition} carriers={carriers} content={content} onContent={onContent}/>}
    <MusicEditor section={page} edition={edition} content={content} onChange={onContent}/></>;
}
