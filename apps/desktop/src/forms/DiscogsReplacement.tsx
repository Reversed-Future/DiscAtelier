import { useEffect, useState } from 'react';
import type { EditionDraft } from '../library/types';
import { discogs, type EditionContent, type ImportPreview } from '../metadata/gateway';
import { DiscogsBrowser } from '../metadata/DiscogsBrowser';
import { DiscogsSettings } from '../metadata/DiscogsSettings';
import { Modal } from '../ui/Modal';

export interface DiscogsDraft { preview: ImportPreview; content: EditionContent }

export function DiscogsReplacement({ editionId, edition, onApply, onClose }: {
  editionId?: string; edition: EditionDraft;
  onApply(value: DiscogsDraft): void; onClose(): void;
}) {
  const [settings, setSettings] = useState(false), [configured, setConfigured] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => { if (settings) void discogs.configured().then(setConfigured).catch(() => {}); }, [settings]);
  return <><DiscogsBrowser categoryId={edition.categoryId} replacing={!!editionId}
    initialQuery={[edition.title.trim(), edition.creator.trim()].filter(Boolean).join(' ')} onClose={onClose} onSettings={() => setSettings(true)}
    onSelect={(preview, release) => {
      if (editionId && preview.existing && preview.existing.editionId !== editionId) {
        throw new Error('这个发行已关联另一版本，请选择其他发行。');
      }
      onApply({ preview, content: {
        genres: release.genres, styles: release.styles, tracks: release.tracklist, credits: release.extraartists,
        companies: release.companies, notes: release.notes, detailsLoaded: true,
      } });
    }}/>
  {settings && <Modal title="Discogs 设置" onClose={() => setSettings(false)} busy={busy}>
    <DiscogsSettings configured={configured} onConfigured={setConfigured} onBusy={setBusy}/>
  </Modal>}</>;
}
