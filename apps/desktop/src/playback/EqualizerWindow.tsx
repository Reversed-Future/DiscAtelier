import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WindowChrome } from '../ui/WindowChrome';
import { Icon } from '../ui/Icon';
import { EqualizerSettings } from './EqualizerSettings';

export function EqualizerWindow() {
  const [pinned, setPinned] = useState(true);
  const [active, setActive] = useState(false);
  useEffect(() => {
    document.body.dataset.window = 'equalizer';
    let live = true;
    const subscription = listen<boolean>('equalizer-window-active', event => {
      if (live) setActive(event.payload);
    });
    void subscription.catch(() => {});
    void getCurrentWindow().isVisible().then(value => { if (live && value) setActive(true); }).catch(() => {});
    void getCurrentWindow().isAlwaysOnTop().then(setPinned).catch(() => {});
    return () => {
      live = false;
      void subscription.then(stop => stop?.()).catch(() => {});
      delete document.body.dataset.window;
    };
  }, []);
  async function togglePin() {
    const next = !pinned;
    try {
      await getCurrentWindow().setAlwaysOnTop(next);
      setPinned(next);
    } catch { /* The window remains usable if the platform rejects pinning. */ }
  }
  return <>
    <WindowChrome title="均衡器" extra={
      <button type="button" className="window-pin" aria-pressed={pinned}
        aria-label={pinned ? '取消置顶' : '窗口置顶'} title={pinned ? '取消置顶' : '窗口置顶'}
        onClick={() => void togglePin()}><Icon name="pin"/></button>
    }/>
    <main className="equalizer-window">
      <header className="equalizer-window-heading">
        <strong>均衡器 · VLC</strong>
        <span>拖动本窗口，边播放边调节</span>
      </header>
      {active && <EqualizerSettings standalone/>}
    </main>
  </>;
}
