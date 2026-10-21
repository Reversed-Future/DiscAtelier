import { useEffect, useState } from 'react';
import { Select } from '../ui/Select';
import { netease, type LinkedMusicAlbum, type DiscAlbumLink } from '../integrations/gateway';
import type { LibraryCopy } from '../library/types';
import { errorMessage } from '../library/gateway';

export function DiscAlbumSelector({ item, discKey, title, albums, bindings, onSaved, onBusy }: {
  item: LibraryCopy; discKey: string; title: string; albums: LinkedMusicAlbum[]; bindings: DiscAlbumLink[];
  onSaved(): Promise<void>; onBusy(busy: boolean): void;
}) {
  const saved = bindings.find(b => b.discKey === discKey)?.albumId;
  const [value, setValue] = useState(saved ? String(saved) : '');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { setValue(saved ? String(saved) : ''); setError(''); }, [discKey, saved]);
  async function save() {
    if (busy) return;
    setBusy(true); onBusy(true); setError('');
    try { await netease.bindDisc(item.editionId, item.editionRevision, discKey, value ? Number(value) : null); await onSaved(); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); onBusy(false); }
  }
  return <section className="disc-album-selector">
    <label>{title} · 音源专辑<Select label={`${title} 的音源专辑`} value={value} disabled={busy}
      options={[{ id: '', label: '从全部关联专辑匹配' }, ...albums.map(a => ({ id: String(a.album.albumId), label: a.album.title }))]} onChange={setValue}/></label>
    <button className="text-button" disabled={busy || value === (saved ? String(saved) : '')} onClick={() => void save()}>{busy ? '保存中' : '保存分盘关联'}</button>
    <p className="setting-hint">此分盘仅从所选专辑匹配，手动指定的单曲保持优先。</p>
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
