import { useState } from 'react';
import type { Descriptor, EditionDraft, MediumDraft } from '../library/types';
import type { EditionContent } from '../metadata/gateway';
import { changeContentTracks } from '../metadata/creditTracks';
import { MusicTrackEditor } from '../forms/MusicTrackEditor';
import { updateTrackRows } from '../forms/contentTracks';
import { OpticalDiscImporter } from './OpticalDiscImporter';
import { importDisc } from './opticalDiscImport';
import { Select } from '../ui/Select';
import { changeVideoMedia, videoDiscPages } from './physicalContents';

interface Props {
  edition: EditionDraft; carriers: Descriptor[]; content: EditionContent;
  onEdition(value: EditionDraft): void; onContent(value: EditionContent): void;
}

export function VideoDiscEditor({ edition, carriers, content, onEdition, onContent }: Props) {
  const [importing, setImporting] = useState(false);
  const [active, setActive] = useState<number | null>(1);
  const pages = videoDiscPages(content.tracks, edition);
  const number = active === null && pages.some(page => page.number === undefined) ? null : Math.min(active ?? 1, edition.media.length);
  const medium = number ? edition.media[number - 1] : null;
  const page = pages.find(page => (page.number ?? null) === number);
  const entries = page?.entries;
  function renameDisc(label: string) {
    if (!number) return;
    if (page?.titleEntry) {
      const rows = updateTrackRows(content.tracks, page.titleEntry.path, {title: label});
      onContent(changeContentTracks(content, rows, edition.title, edition.media, true));
    }
    onEdition({ ...edition, media: edition.media.map((row, i) => i === number - 1 ? { ...row, label } : row) });
  }
  function setMedia(media: MediumDraft[], removed?: number) {
    if (content.tracks.length) onContent(changeVideoMedia(content, edition, media, removed));
    onEdition({ ...edition, media });
  }
  function addDisc() {
    setMedia([...edition.media, { carrierId: 'bd', label: '' }]);
    setActive(edition.media.length + 1);
  }
  return <section className="content-editor">
    <div className="content-editor-heading"><h3>实体碟片</h3>
      <button type="button" className="text-button" disabled={edition.media.length >= 99} onClick={addDisc}>添加碟片</button>
    </div>
    <p className="setting-hint">按这套发行实际附带的碟片填写。本编、特典影像和附赠 CD 可以分别记录。</p>
    <nav className="disc-tabs" aria-label="选择实体碟片" role="tablist">{pages.map(page => <button type="button" key={page.key}
      role="tab" aria-selected={number === (page.number ?? null)}
      onClick={() => setActive(page.number ?? null)}>{page.number ? `Disc ${page.number} · ${page.name}` : '未分盘'}</button>)}</nav>
    {medium && number && <>
      <button type="button" className="text-button" onClick={() => setImporting(true)}>从光驱导入</button>
      {importing && <OpticalDiscImporter target={`Disc ${number} · ${page?.name || medium.label}`} occupied={!!entries?.length} onClose={() => setImporting(false)} onApply={(source, mode) => {
        const draft = importDisc(edition, content, number, source, mode);
        onEdition(draft.edition); onContent(draft.content); setImporting(false);
      }}/>}
      <div className="form-row">
        <label>载体<Select label="当前碟片载体" value={medium.carrierId} options={carriers}
          onChange={carrierId => setMedia(edition.media.map((row, i) => i === number - 1 ? { ...row, carrierId } : row))}/></label>
        <label>盘名<input aria-label="盘名" maxLength={200} placeholder="例如：本编、特典映像或原声 CD" value={page?.titleEntry?.source.title || medium.label}
          onChange={e => renameDisc(e.target.value)}/></label>
      </div>
      {edition.media.length > 1 && <button type="button" className="text-button" disabled={!!entries?.length}
        title={entries?.length ? '请先移走或移除这张碟片的内容' : undefined} onClick={() => {
          setMedia(edition.media.filter((_, i) => i !== number - 1), number);
          setActive(Math.min(number, edition.media.length - 1));
        }}>移除这张碟片</button>}
    </>}
    <MusicTrackEditor tracks={content.tracks} title={edition.title} media={edition.media} discNumber={number}
      onChange={(rows, sameRows) => onContent(changeContentTracks(content, rows, edition.title, edition.media, sameRows))}/>
  </section>;
}
