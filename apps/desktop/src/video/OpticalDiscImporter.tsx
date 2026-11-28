import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { errorMessage } from '../library/gateway';
import { optical, type OpticalDrive, type OpticalMedium } from '../optical/gateway';
import { formatDuration } from '../optical/bluraySegments';
import { Icon } from '../ui/Icon';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { blurayPrograms, cdProgram, dvdProgram, type DiscProgram, type ImportMode, type OpticalImport } from './opticalDiscImport';
import './opticalImport.css';

type Apply = (source: OpticalImport, mode: ImportMode) => void;
type LoadedDrive = OpticalDrive & { medium: OpticalMedium };

export function OpticalDiscImporter({ target, occupied, onApply, onClose }: {
  target: string; occupied: boolean; onApply: Apply; onClose(): void;
}) {
  const [drives, setDrives] = useState<LoadedDrive[] | null>(null);
  const [mount, setMount] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void optical.list().then(result => {
      if (!live) return;
      const ready = result.filter((d): d is LoadedDrive => d.status === 'ready' && !!d.medium && d.medium.kind !== 'other');
      setDrives(ready);
      setMount(previous => ready.some(d => d.mountPoint === previous) ? previous : ready[0]?.mountPoint || '');
    }).catch(e => { if (live) {setError(errorMessage(e)); setDrives([]);} });
    return () => { live = false; };
  }, [refresh]);
  const drive = drives?.find(d => d.mountPoint === mount);
  return createPortal(<Modal title="从光驱导入" onClose={onClose} className="optical-import-panel">
    <div className="optical-import-source">
      <span className="optical-import-disc"><Icon name="disc"/></span>
      <div className="optical-import-source-text">
        <strong>{drive?.medium.discTitle || drive?.medium.label || drive?.name || '光驱'}</strong>
        {drive && <small>{drive.mountPoint}　{drive.name}</small>}
      </div>
      {drives && drives.length > 1 && <Select label="导入来源光驱" value={mount} onChange={setMount} options={drives.map(d => ({
        id: d.mountPoint, label: d.mountPoint + ' · ' + d.name
      }))}/>}
      <button type="button" className="icon-button" aria-label="刷新光驱" title="刷新光驱"
        disabled={!drives} onClick={() => { setDrives(null); setError(''); setRefresh(n => n + 1); }}><Icon name="rotate"/></button>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!drives ? <p role="status">正在读取光驱…</p> : !drives.length && !error ? <p>请放入蓝光、DVD 或音频 CD，然后刷新光驱。</p> : null}
    {drive && <>
      <DiscContents target={target} key={mount + ':' + drive.medium.token + ':' + refresh} drive={drive} occupied={occupied} onApply={onApply}/>
    </>}
  </Modal>, document.body);
}

function DiscContents({ drive, occupied, onApply, target }: {drive: LoadedDrive; occupied: boolean; onApply: Apply; target: string}) {
  const { mountPoint, medium } = drive;
  const alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [dvdTitle, setDvdTitle] = useState(1);
  const [dvdCount, setDvdCount] = useState(0);
  const [programs, setPrograms] = useState<DiscProgram[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<ImportMode | ''>(occupied ? '' : 'append');
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const carrier = medium.kind === 'bluray' ? 'bd' : medium.kind === 'audioCd' ? 'cd' : 'dvd';
  const title = medium.discTitle || medium.label;
  useEffect(() => {
    let live = true;
    async function read() {
      if (carrier === 'bd') return blurayPrograms(await optical.blurayPlaylists(mountPoint, medium.token));
      if (carrier === 'cd') return [cdProgram(medium.tracks)];
      const count = await optical.dvdTitleCount(mountPoint, medium.token);
      if (!live) return [];
      setDvdCount(count);
      return [dvdProgram(dvdTitle, await optical.dvdChapters(mountPoint, medium.token, dvdTitle))];
    }
    void read().then(result => {
      if (!live) return;
      const available = result.filter(p => p.entries.length);
      setPrograms(available); setSelected(available.length ? [available[0].id] : []);
      if (!available.length) setError('光盘上没有读到可导入的内容。');
    }).catch(e => { if (live) setError(errorMessage(e)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [carrier, mountPoint, medium, dvdTitle]);
  const chosen = programs.filter(p => selected.includes(p.id));
  const count = chosen.reduce((n, p) => n + p.entries.length, 0);
  async function apply() {
    if (!mode || !count || checking) return;
    setChecking(true); setError('');
    try {
      const current = await optical.list();
      if (!alive.current) return;
      if (!current.some(d => d.mountPoint === mountPoint && d.medium?.token === medium.token)) throw Error('光盘已变化，请刷新光驱。');
      onApply({title, carrier, programs: chosen}, mode);
    } catch (e) { setError(errorMessage(e)); }
    finally { setChecking(false); }
  }
  return <>
    {dvdCount > 1 && <label>DVD 标题<Select label="DVD 标题" value={String(dvdTitle)} disabled={checking}
      options={Array.from({length: dvdCount}, (_, i) => ({id: String(i + 1), label: `标题 ${i + 1}`}))}
      onChange={id => { if (Number(id) !== dvdTitle) { setDvdTitle(Number(id)); setPrograms([]); setSelected([]); setLoading(true); setError(''); } }}/></label>}
    {loading && <p role="status">正在读取盘片目录…</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {!!programs.length && <>
      <div className="optical-import-choice">
        {carrier === 'bd' && <section className="optical-import-programs" aria-label="播放列表">
          <header><h3>播放列表</h3><small>已选 {selected.length} / {programs.length}</small></header>
          <div className="optical-import-rows">{programs.map(p => <label key={p.id}>
            <input type="checkbox" disabled={checking} checked={selected.includes(p.id)} onChange={e => {
              const checked = e.target.checked;
              setSelected(ids => checked ? [...ids, p.id] : ids.filter(id => id !== p.id));
            }}/>
            <span>{p.id}</span><small>{p.entries.length} 项</small><time>{formatDuration(p.duration)}</time>
          </label>)}</div>
        </section>}
        <section aria-label="导入预览"><header><h3>{carrier === 'cd' ? '音轨预览' : '章节预览'}</h3>
          <small>{count} 项 · {formatDuration(chosen.reduce((n, p) => n + p.duration, 0))}</small></header>
          <div className="optical-import-rows optical-import-preview">
            {!count && <p>选择播放列表后查看章节。</p>}
            {chosen.map(p => <div key={p.id}>
              {chosen.length > 1 && <h4>{p.id}</h4>}
              {p.entries.map((entry, index) => <div className="optical-import-entry" key={index}><span>{entry.title}</span><time>{formatDuration(entry.duration)}</time></div>)}
            </div>)}
          </div>
        </section>
      </div>
      <footer className="optical-import-footer">
        <div className="optical-import-target"><small>导入到</small><strong>{target}</strong></div>
        {occupied && <div className="optical-import-mode" role="group" aria-label="当前碟片已有内容，选择导入方式">
          {(['append', 'replace'] as const).map(value => <button type="button" key={value} disabled={checking}
            aria-pressed={mode === value} onClick={() => setMode(value)}>{value === 'append' ? '追加内容' : '替换内容'}</button>)}
        </div>}
        <button type="button" className="solid-button" onClick={() => void apply()} disabled={!count || !mode || checking}>
          {checking ? '正在核对光盘…' : '带入编辑器'}</button>
      </footer>
    </>}
  </>;
}
