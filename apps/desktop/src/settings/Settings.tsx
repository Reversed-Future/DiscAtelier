import { VideoSettings } from '../video/VideoSettings';
import { useEffect, useRef, useState } from 'react';
import { Modal } from '../ui/Modal';
import { enter } from '../ui/motion';
import { errorMessage } from '../library/gateway';
import { discogs } from '../metadata/gateway';
import { DiscogsSettings } from '../metadata/DiscogsSettings';
import { PlaybackSettings } from '../optical/PlaybackSettings';
import { IntegrationSettings } from '../integrations/IntegrationSettings';
import { ExchangeSettings } from '../exchange/ExchangeSettings';
import { DataSettings } from './DataSettings';
import { UpdateSettings } from './UpdateSettings';

const pages = [{ id: 'data', label: '数据' }, { id: 'exchange', label: '汇率' }, { id: 'video', label: '影像资料' }, { id: 'discogs', label: 'Discogs' }, { id: 'netease', label: '网易云' }, { id: 'assistant', label: '助手' }, { id: 'playback', label: '播放' }, { id: 'updates', label: '更新' }] as const;
type Page = typeof pages[number]['id'];
export function Settings({ initialPage, libraryAvailable, onRestore, onClose, playing }: {
  initialPage: 'home' | 'discogs'; libraryAvailable: boolean; onRestore(): void; onClose(): void; playing: boolean;
}) {
  const [page, setPage] = useState<Page>(initialPage === 'home' ? 'data' : initialPage);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => { enter(content.current, 3); }, [page]);
  useEffect(() => {
    if (page !== 'discogs') return;
    let active = true;
    setBusy(true);
    void discogs.configured().then(value => { if (active) setConfigured(value); })
      .catch(cause => { if (active) setError(errorMessage(cause)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [page]);
  return <Modal title="设置" onClose={onClose} busy={busy} className="settings-panel">
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="设置分类">
        {pages.map(item => <button key={item.id} aria-current={page === item.id ? 'page' : undefined} disabled={busy}
          onClick={() => { setError(''); setPage(item.id); }}>{item.label}</button>)}
        <span className="settings-brand">DiscAtelier</span>
      </nav>
      <section ref={content} className="settings-content" aria-label={pages.find(item => item.id === page)?.label}>
        <h3>{pages.find(item => item.id === page)?.label}</h3>
        {page === 'data' && <DataSettings libraryAvailable={libraryAvailable} onRestore={onRestore} onBusy={setBusy}/>}
        {page === 'discogs' && <DiscogsSettings configured={configured} onConfigured={setConfigured} onBusy={setBusy} disabled={busy}/>}
        {(page === 'netease' || page === 'assistant') && <IntegrationSettings key={page} kind={page} onBusy={setBusy}/>}
        {page === 'video' && <VideoSettings onBusy={setBusy}/>}
        {page === 'exchange' && <ExchangeSettings onBusy={setBusy}/>}
        {page === 'playback' && <PlaybackSettings onBusy={setBusy}/>}
        {page === 'updates' && <UpdateSettings onBusy={setBusy} playing={playing}/>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
    </div>
  </Modal>;
}
