import { useEffect, useRef, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { errorMessage } from '../library/gateway';
import { optical, type MenuRecognition, type OpticalCandidate, type OpticalDisc, type OpticalMedium } from './gateway';

export function OpticalAssociationEditor({ medium, label, recognition, onClose, onSaved }: {
  medium: OpticalMedium; label: string; recognition: MenuRecognition | null; onClose(): void; onSaved(): Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<OpticalCandidate[]>([]);
  const [entry, setEntry] = useState<OpticalCandidate | null>(null);
  const [discs, setDiscs] = useState<OpticalDisc[]>([]);
  const [disc, setDisc] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    void search('');
    return () => { alive.current = false; };
  }, []);
  async function search(text: string) {
    setBusy(true); setError(''); setEntry(null);
    try { const found = await optical.candidates(label, text); if (alive.current) setRows(found); }
    catch (cause) { if (alive.current) setError(errorMessage(cause)); }
    finally { if (alive.current) setBusy(false); }
  }
  async function select(row: OpticalCandidate) {
    setBusy(true); setError('');
    try {
      const values = await optical.discs(row.editionId);
      if (alive.current) { setEntry(row); setDiscs(values); setDisc(''); }
    } catch (cause) { if (alive.current) setError(errorMessage(cause)); }
    finally { if (alive.current) setBusy(false); }
  }
  async function save(copyId: string, discKey: string | null) {
    setBusy(true); setError('');
    try {
      await optical.associate(medium.token, copyId, medium.label, discKey);
      if (alive.current) await onSaved();
    } catch (cause) { if (alive.current) setError(errorMessage(cause)); }
    finally { if (alive.current) setBusy(false); }
  }
  return <Modal title="纠正光盘关联" onClose={onClose} className="optical-associate-panel" busy={busy}>
    {!!recognition?.matches.length && <div className="optical-candidates">
      {recognition.matches.map(row => <button className="optical-candidate" key={`${row.copyId}:${row.discKey}`} disabled={busy} onClick={() => void save(row.copyId, row.discKey)}>
        <span><strong>{row.title} · {row.discLabel}</strong><small>{row.reason}</small></span>
      </button>)}
    </div>}
    <form className="optical-candidate-search" onSubmit={event => { event.preventDefault(); void search(query); }}>
      <input aria-label="搜索收藏" value={query} disabled={busy} placeholder="搜索标题、艺术家或编号" onChange={event => setQuery(event.target.value)}/>
      <button className="solid-button" disabled={busy}>搜索</button>
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}
    {entry ? <div className="optical-disc-selection">
      <p className="setting-hint">{entry.title}</p>
      <Select label="对应 Disc" value={disc} disabled={busy} options={[{ id: '', label: '仅关联收藏，不指定 Disc' }, ...discs.map(row => ({ id: row.key, label: row.label }))]} onChange={setDisc}/>
      <div className="optical-actions"><button className="text-button" disabled={busy} onClick={() => setEntry(null)}>重新选择收藏</button>
        <button className="solid-button" disabled={busy} onClick={() => void save(entry.copyId, disc || null)}>保存关联</button></div>
    </div> : <div className="optical-candidates">{rows.map(row => <button className="optical-candidate" key={row.copyId} disabled={busy} onClick={() => void select(row)}>
      <span><strong>{row.title}</strong><small>{[row.creator, row.editionLabel].filter(Boolean).join(' · ')}</small></span>
    </button>)}{!busy && !rows.length && <p className="setting-hint">没有匹配的收藏，可修改搜索词后重试。</p>}</div>}
  </Modal>;
}
