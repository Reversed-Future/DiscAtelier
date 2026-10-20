import { useRef, useState } from 'react';
import type { CoverChange, EditionDraft } from '../library/types';
import { readCover } from '../library/artwork';
import { errorMessage } from '../library/gateway';
import { Cover } from '../collection/Cover';

export function CoverField({ edition, assetId, value, onChange, onBusy }: {
  edition: EditionDraft; assetId?: string | null; value: CoverChange; onChange(value: CoverChange): void; onBusy(value: boolean): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  return <div className="cover-field">
    <div className="cover-preview">{value.action === 'replace'
      ? <img src={value.dataUrl} alt="新封面预览"/>
      : <Cover edition={edition} assetId={value.action === 'keep' ? assetId : null}/>}</div>
    <div className="cover-controls">
      <button type="button" className="text-button" disabled={reading} onClick={() => input.current?.click()}>{reading ? '读取中' : value.action === 'replace' || assetId ? '更换封面' : '选择封面'}</button>
      {(value.action === 'replace' || (value.action === 'keep' && assetId)) && <button type="button" className="text-button" disabled={reading} onClick={() => { onChange({ action: 'remove' }); setError(''); }}>移除封面</button>}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" aria-label="封面文件" hidden onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (!file) return;
        setReading(true); onBusy(true); setError('');
        try { onChange({ action: 'replace', dataUrl: await readCover(file) }); }
        catch (cause) { setError(errorMessage(cause)); }
        finally { setReading(false); onBusy(false); }
      }}/>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  </div>;
}
