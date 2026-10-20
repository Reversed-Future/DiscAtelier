import { useEffect, useRef, useState } from 'react';
import { Modal } from '../ui/Modal';
import { enter } from '../ui/motion';
import { library, errorMessage } from '../library/gateway';
import { discogs } from '../metadata/gateway';
import { DiscogsSettings } from '../metadata/DiscogsSettings';
import { PlaybackSettings } from '../optical/PlaybackSettings';

export function Settings({ initialPage, libraryAvailable, onRestore, onClose }: {
  initialPage: 'home' | 'discogs'; libraryAvailable: boolean; onRestore(): void; onClose(): void;
}) {
  const [page, setPage] = useState<'home' | 'discogs' | 'playback'>(initialPage);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [backup, setBackup] = useState('');
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => { enter(content.current, 0); }, [page, backup]);
  useEffect(() => {
    if (page !== 'discogs') return;
    let active = true;
    setBusy(true);
    void discogs.configured().then(value => { if (active) setConfigured(value); })
      .catch(cause => { if (active) setError(errorMessage(cause)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [page]);
  return <Modal title={backup ? '备份已保存' : page === 'discogs' ? 'Discogs 设置' : page === 'playback' ? '播放设置' : '设置'} onClose={onClose} busy={busy}>
    <div ref={content}>
      {backup ? <p className="backup-path">{backup}</p> : page === 'discogs' ? <>
        <button type="button" className="text-button settings-back" disabled={busy} onClick={() => { setError(''); setPage('home'); }}>返回设置</button>
        <DiscogsSettings configured={configured} onConfigured={setConfigured} onBusy={setBusy} disabled={busy}/>
      </> : page === 'playback' ? <>
        <button type="button" className="text-button settings-back" disabled={busy} onClick={() => { setError(''); setPage('home'); }}>返回设置</button>
        <PlaybackSettings onBusy={setBusy}/>
      </> : <>
        <div className="settings-list">
          <button type="button" disabled={busy} onClick={() => { setError(''); setPage('discogs'); }}>Discogs<span aria-hidden="true">›</span></button>
          <button type="button" disabled={busy} onClick={() => { setError(''); setPage('playback'); }}>播放<span aria-hidden="true">›</span></button>
        </div>
        <div className="settings-list">
          <button type="button" disabled={!libraryAvailable || busy} onClick={async () => {
            setBusy(true); setError('');
            try { setBackup(await library.backup()); }
            catch (cause) { setError(errorMessage(cause)); }
            finally { setBusy(false); }
          }}>{busy ? '备份中' : '备份收藏'}</button>
          <button type="button" disabled={!libraryAvailable || busy} onClick={onRestore}>恢复收藏</button>
        </div>
        <p className="settings-version">DiscAtelier 0.1.3</p>
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  </Modal>;
}
