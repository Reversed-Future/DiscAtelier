import { useEffect, useState } from 'react';
import type { Descriptor, EditionDraft } from '../library/types';
import { discogs, type EditionContent, type ImportPreview } from '../metadata/gateway';
import { DiscogsBrowser } from '../metadata/DiscogsBrowser';
import { DiscogsSettings } from '../metadata/DiscogsSettings';
import { Modal } from '../ui/Modal';

export interface DiscogsDraft { preview: ImportPreview; content: EditionContent }

export function DiscogsReplacement({ editionId, edition, categories, carriers, onApply, onClose }: {
  editionId: string; edition: EditionDraft; categories: Descriptor[]; carriers: Descriptor[];
  onApply(value: DiscogsDraft): void; onClose(): void;
}) {
  const [settings, setSettings] = useState(false), [configured, setConfigured] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => { if (settings) void discogs.configured().then(setConfigured).catch(() => {}); }, [settings]);
  if (settings) return <Modal title="Discogs 设置" onClose={() => setSettings(false)} busy={busy}>
    <DiscogsSettings configured={configured} onConfigured={setConfigured} onBusy={setBusy}/>
  </Modal>;
  return <DiscogsBrowser categoryId={edition.categoryId} categories={categories} carriers={carriers}
    initialQuery={[edition.title.trim(), edition.creator.trim()].filter(Boolean).join(' ')} onSaved={async () => {}} onClose={onClose} onSettings={() => setSettings(true)}
    onSelect={(preview, release) => {
      if (preview.existing && preview.existing.editionId !== editionId) {
        throw new Error('这个发行已关联另一版本，请选择其他发行。');
      }
      onApply({ preview, content: {
        genres: release.genres, styles: release.styles, tracks: release.tracklist, credits: release.extraartists,
        companies: release.companies, notes: release.notes, detailsLoaded: true,
      } });
    }}/>;
}
