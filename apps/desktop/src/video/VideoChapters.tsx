import { useEffect, useRef, useState } from 'react';
import { EpisodeList } from './EpisodeList';
import { mergeEpisodes } from './mergedEpisodes';
import { errorMessage } from '../library/gateway';
import { video, type VideoChapter, type VideoWork } from './gateway';
export function VideoChapters({ work, enabled = true, onChange, onSave }: { work: VideoWork; enabled?: boolean; onChange?(rows: VideoChapter[]): void; onSave?(rows: VideoChapter[]): Promise<void> }) {
  const [rows, setRows] = useState<VideoChapter[] | null>(work.chapters ?? null);
  const [busy, setBusy] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(''), [changed, setChanged] = useState(false);
  const live = useRef(true), pending = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  async function load() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { const next = await video.chapters(work); if (live.current) { setRows(next); setChanged(true); onChange?.(next); } }
    catch (cause) { if (live.current) setError(errorMessage(cause)); }
    finally { pending.current = false; if (live.current) setBusy(false); }
  }
  useEffect(() => { if (enabled && rows === null) void load(); }, [enabled]);
  async function save() {
    if (!onSave || !rows || saving) return;
    setSaving(true); setError('');
    try { await onSave(rows); if (live.current) setChanged(false); }
    catch (cause) { if (live.current) setError(errorMessage(cause)); }
    finally { if (live.current) setSaving(false); }
  }
  return <section className="video-chapters" aria-busy={busy || saving}>
    <div className="video-section-heading">
      <span className="setting-hint">作品分集{rows ? ` · ${rows.length}` : ''}</span>
      <div className="video-heading-actions">
        {onSave && changed && rows && !saving && <button type="button" className="text-button" disabled={busy} onClick={() => void save()}>确认保存这些章节</button>}
        {saving && <span className="setting-hint">保存中…</span>}
        <button type="button" className="text-button" disabled={busy || saving} onClick={() => void load()}>{busy ? '读取章节中…' : rows ? '刷新章节' : '获取章节'}</button>
      </div>
    </div>
    <EpisodeList groups={mergeEpisodes([{...work,chapters:rows}])}/>
    {rows?.length === 0 && <p className="utility-copy">资料源暂无分集信息。</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
