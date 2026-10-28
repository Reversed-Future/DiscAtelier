import { WindowSettings } from '../shell/WindowSettings';
import { VideoSettings } from '../video/VideoSettings';
import { useEffect, useRef, useState } from 'react';
import { Modal } from '../ui/Modal';
import { enter } from '../ui/motion';
import { PlaybackSettings } from '../optical/PlaybackSettings';
import { IntegrationSettings } from '../integrations/IntegrationSettings';
import { ExchangeSettings } from '../exchange/ExchangeSettings';
import { DataSettings } from './DataSettings';
import { MusicSettings } from './MusicSettings';
import { AboutSettings } from './AboutSettings';

const pages = [{ id: 'window', label: '窗口' }, { id: 'data', label: '数据' }, { id: 'exchange', label: '汇率' }, { id: 'video', label: '影像资料' }, { id: 'music', label: '音乐资料' }, { id: 'assistant', label: '助手' }, { id: 'playback', label: '播放' }, { id: 'about', label: '关于' }] as const;
type Page = typeof pages[number]['id'];
export function Settings({ initialPage, libraryAvailable, onRestore, onClose }: {
  initialPage: 'home' | 'discogs' | 'about'; libraryAvailable: boolean; onRestore(): void; onClose(): void;
}) {
  const [page, setPage] = useState<Page>(initialPage === 'home' ? 'data' : initialPage === 'about' ? 'about' : 'music');
  const [busy, setBusy] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => { enter(content.current, 3); }, [page]);
  return <Modal title="设置" onClose={onClose} busy={busy} className="settings-panel">
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="设置分类">
        {pages.map(item => <button key={item.id} aria-current={page === item.id ? 'page' : undefined} disabled={busy}
          onClick={() => setPage(item.id)}>{item.label}</button>)}
        <span className="settings-brand">DiscAtelier</span>
      </nav>
      <section ref={content} className="settings-content" data-long-scroll aria-label={pages.find(item => item.id === page)?.label}>
        <h3>{pages.find(item => item.id === page)?.label}</h3>
        {page === 'window' && <WindowSettings/>}
        {page === 'data' && <DataSettings libraryAvailable={libraryAvailable} onRestore={onRestore} onBusy={setBusy}/>}
        {page === 'music' && <MusicSettings initialSection={initialPage === 'discogs' ? 'discogs' : 'musicbrainz'} onBusy={setBusy}/>}
        {page === 'assistant' && <IntegrationSettings key="assistant" kind="assistant" onBusy={setBusy}/>}
        {page === 'video' && <VideoSettings onBusy={setBusy}/>}
        {page === 'exchange' && <ExchangeSettings onBusy={setBusy}/>}
        {page === 'playback' && <PlaybackSettings onBusy={setBusy}/>}
        {page === 'about' && <AboutSettings onBusy={setBusy}/>}
      </section>
    </div>
  </Modal>;
}
