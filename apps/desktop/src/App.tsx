import { useCallback, useEffect, useRef, useState } from 'react';
import type { LibraryCopy, LibraryQuery, LibrarySnapshot } from './library/types';
import { library, desktopAvailable, errorMessage } from './library/gateway';
import { Icon } from './ui/Icon';
import { CollectionMenu } from './ui/CollectionMenu';
import { enter } from './ui/motion';
import { Browse } from './collection/Browse';
import { Inspection } from './collection/Inspection';
import { AddCopy } from './forms/AddCopy';
import { EditEdition } from './forms/EditEdition';
import { RestoreLibrary } from './forms/RestoreLibrary';
import { useZoom } from './ui/useZoom';
import { DiscogsBrowser } from './metadata/DiscogsBrowser';
import { useScrollbars } from './ui/useScrollbars';
import { Settings } from './settings/Settings';
import { useCollectionArtwork } from './collection/useCollectionArtwork';
import { OpticalPanel } from './optical/OpticalPanel';
import { usePlayback } from './playback/usePlayback';
import { AssistantDock } from './assistant/AssistantDock';
import { AudioPlayer } from './playback/AudioPlayer';
import { PlayerView } from './playback/PlayerView';
import { MusicDock } from './playback/MusicDock';

export function App() {
  const player = usePlayback();
  useZoom();
  useScrollbars();
  const [query, setQuery] = useState<LibraryQuery>({ categoryId: 'music', status: null, query: '' });
  const [snapshot, setSnapshot] = useState<LibrarySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [organize, setOrganize] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [inspected, setInspected] = useState<LibraryCopy | null>(null);
  const [add, setAdd] = useState<{ existing?: LibraryCopy } | null>(null);
  const [editing, setEditing] = useState<LibraryCopy | null>(null);
  const [notice, setNotice] = useState('');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [opticalOpen, setOpticalOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState<'home' | 'discogs' | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [videoDiscogs, setVideoDiscogs] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const scene = useRef<HTMLElement>(null);
  const generation = useRef(0);
  const notifyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = (message: string) => {
    clearTimeout(notifyTimer.current); setNotice(message);
    notifyTimer.current = setTimeout(() => setNotice(''), 3000);
  };
  const refresh = useCallback(async (filter: LibraryQuery) => {
    const version = ++generation.current;
    if (!desktopAvailable()) { setError('请在 DiscAtelier 桌面窗口中打开收藏库。'); setLoading(false); return; }
    setLoading(true);
    try {
      const result = await library.list(filter);
      if (version !== generation.current) return;
      setSnapshot(result); setError('');
      setInspected(previous => previous ? result.copies.find(item => item.id === previous.id) || null : null);
    } catch (cause) { if (version === generation.current) setError(errorMessage(cause)); }
    finally { if (version === generation.current) setLoading(false); }
  }, []);
  useEffect(() => { void refresh(query); }, [query, refresh]);
  useEffect(() => { if (player.open) setOpticalOpen(false); }, [player.open]);
  useEffect(() => { if (player.open || player.musicQueue.open) setAssistantOpen(false); }, [player.open, player.musicQueue.open]);
  useEffect(() => { enter(scene.current, 0); }, [query.categoryId, query.status, organize]);
  useEffect(() => {
    if (searchOpen) { enter(search.current); search.current?.focus(); }
  }, [searchOpen]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.key === '/' && !document.querySelector('.player-view, dialog[open]') && !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement).tagName)) {
        event.preventDefault(); setSearchOpen(true); search.current?.focus();
      }
    };
    document.addEventListener('keydown', shortcut);
    return () => { document.removeEventListener('keydown', shortcut); clearTimeout(notifyTimer.current); };
  }, []);
  const openAdd = () => query.categoryId === 'music' ? setMetadataOpen(true) : setAdd({});
  const items = snapshot?.copies || [];
  const modelActive = !assistantOpen && !add && !restoring && !metadataOpen && !settingsPage && !opticalOpen && !player.open;
  const current = inspected || items.find(item => item.id === selectedId) || items[0];
  const artwork = useCollectionArtwork(current, modelActive && (!organize || !!inspected), !!inspected);
  return <div className="workspace" data-list={organize}>
    <header className="topbar" inert={player.open}>
      <div className="wordmark"><span className="disc-mark"/>DiscAtelier<span className="wordmark-dot">.</span></div>
      <nav className="categories" aria-label="收藏分区">{snapshot?.categories.map(category =>
        <button key={category.id} className={query.categoryId === category.id ? 'active' : ''} onClick={() => setQuery({ ...query, categoryId: category.id, query: '' })}>{category.label}</button>
      )}</nav>
      <div className="top-actions">
        <div className={`search-control${searchOpen ? ' search-open' : ''}`}>
          <button ref={searchTrigger} className="icon-button" aria-label="搜索收藏" data-tooltip="搜索" aria-expanded={searchOpen} onClick={() => { if (searchOpen) setQuery({ ...query, query: '' }); setSearchOpen(value => !value); }}><Icon name="search"/></button>
          {searchOpen && <input ref={search} type="search" aria-label="搜索关键词" placeholder="搜索" value={query.query}
            onChange={event => setQuery({ ...query, query: event.target.value })}
            onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setQuery({ ...query, query: '' }); setSearchOpen(false); searchTrigger.current?.focus(); } }}/>}
        </div>
        <button className="icon-button" aria-label="添加收藏" data-tooltip="添加" disabled={!snapshot} onClick={openAdd}><Icon name="plus"/></button>
        <button className={`icon-button${query.status || organize ? ' filtered' : ''}`} id="tools-toggle" popoverTarget="tools-popover" aria-label="更多" data-tooltip="更多"><Icon name="more"/></button>
      </div>
    </header>
    <CollectionMenu status={query.status} snapshot={snapshot} organize={organize}
      onStatus={status => setQuery({ ...query, status })}
      onOrganize={() => setOrganize(value => !value)}
      onOptical={() => setOpticalOpen(true)} onSettings={() => setSettingsPage('home')}/>
    <main id="scene" ref={scene} aria-label="收藏展示" aria-busy={loading} inert={player.open}>
      {error ? <div className="empty-state"><span className="disc-mark"/><p role="alert">{error}</p>{desktopAvailable() && <button onClick={() => void refresh(query)}>重试</button>}</div> :
        !snapshot ? <div className="empty-state"><span className="disc-mark"/><p>正在打开收藏库</p></div> :
        items.length ? <Browse items={items} selectedId={selectedId} select={setSelectedId} inspect={setInspected} organize={organize} modelActive={modelActive} takenId={inspected?.id} artworkSlot={artwork.shelfRef}/> :
        <div className="empty-state"><span className="disc-mark"/><p>{query.query || query.status ? '没有匹配的收藏' : query.categoryId === 'music' ? '还没有音乐收藏' : '还没有影像收藏'}</p>
          <button onClick={() => query.query || query.status ? setQuery({ ...query, query: '', status: null }) : openAdd()}>{query.query || query.status ? '清除筛选' : '添加收藏'}</button></div>}
    </main>
    {artwork.portal}
    {opticalOpen && !player.open && <OpticalPanel player={player} onClose={() => setOpticalOpen(false)}/>}
    {player.open && (player.snapshot?.source.playlist.startsWith('cd-track:') ? <AudioPlayer player={player}/> : <PlayerView player={player}/>)}
    {player.active && !player.snapshot?.source.playlist.startsWith('netease-song:') && !opticalOpen && !player.open && <button className="playback-return" onClick={player.show} aria-label="打开播放器">
      {player.snapshot?.paused ? '已暂停' : player.snapshot?.phase === 'loading' ? '读取中' : '播放中'} · {player.snapshot?.title}
    </button>}
    {inspected && <Inspection key={inspected.id} player={player} item={inspected} carriers={snapshot?.carriers || []} artworkSlot={artwork.inspectionRef} prepareClose={artwork.prepareClose} modelBusy={artwork.busy} onClose={() => setInspected(null)} onSaved={async () => { const filter = { ...query, status: null, query: '' }; setQuery(filter); await refresh(filter); notify('已保存'); }}
      edit={() => setEditing(inspected)}/>}
    {editing && snapshot && <EditEdition item={editing} categories={snapshot.categories} carriers={snapshot.carriers}
      onClose={() => setEditing(null)}
      onSaved={categoryId => { setSelectedId(editing.id); setQuery({ categoryId, query: '', status: null }); notify('版本已保存'); }}/>}
    {add && snapshot && <AddCopy categoryId={query.categoryId} categories={snapshot.categories} carriers={snapshot.carriers} existing={add.existing} onClose={() => setAdd(null)}
      onSaved={async (id, categoryId) => { setSelectedId(id); setQuery({ categoryId, query: '', status: null }); notify('已加入收藏'); }}/>}
    {restoring && <RestoreLibrary onClose={() => setRestoring(false)} onRestored={() => {
      setInspected(null); setSelectedId(''); setQuery({ categoryId: 'music', status: null, query: '' }); notify('收藏已恢复');
    }}/>}
    {metadataOpen && snapshot && query.categoryId === 'video' && !videoDiscogs && <AddCopy categoryId="video" onDiscogs={() => setVideoDiscogs(true)} categories={snapshot.categories} carriers={snapshot.carriers} onClose={() => { setMetadataOpen(false); setVideoDiscogs(false); }}
      onSaved={async (id, categoryId) => { setSelectedId(id); setQuery({ categoryId, query: '', status: null }); notify('已加入收藏'); }}/>}
    {metadataOpen && snapshot && (query.categoryId !== 'video' || videoDiscogs) && <DiscogsBrowser categoryId={query.categoryId} categories={snapshot.categories} carriers={snapshot.carriers}
      onSettings={() => setSettingsPage('discogs')}
      onManual={() => { setMetadataOpen(false); setVideoDiscogs(false); setAdd({}); }}
      onClose={() => { setMetadataOpen(false); setVideoDiscogs(false); }}
      onSaved={async (id, categoryId) => { setSelectedId(id); setQuery({ categoryId, query: '', status: null }); notify('已加入收藏'); }}/>}
    {settingsPage && <Settings initialPage={settingsPage} libraryAvailable={!!snapshot} playing={player.active}
      onClose={() => setSettingsPage(null)}
      onRestore={() => { setSettingsPage(null); setMetadataOpen(false); setRestoring(true); }}/>}
    <div className={`toast${notice ? ' visible' : ''}`} role="status">{notice}</div>
    <MusicDock player={player}/>
    <AssistantDock open={assistantOpen} hidden={player.open} onOpen={value => { if (value) player.musicQueue.setOpen(false); setAssistantOpen(value); }} onChanged={() => void refresh(query)}/>
  </div>;
}
