import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Icon } from '../ui/Icon';
import { errorMessage } from '../library/gateway';
import { emptyTray, shell, type TrayAction, type TrayState } from './gateway';
import './shell.css';

export function TrayPanel() {
  const [state, setState] = useState(emptyTray), [error, setError] = useState(''), [opening, setOpening] = useState(0);
  useEffect(() => {
    let live = true;
    const update = listen<TrayState>('tray-state', event => { if (live) setState(event.payload); });
    const open = listen('tray-open', () => { if (live) { setOpening(value => value + 1); setError(''); } });
    void update.then(() => shell.snapshot()).then(value => { if (live) setState(value); }).catch(cause => { if (live) setError(errorMessage(cause)); });
    void open.catch(cause => { if (live) setError(errorMessage(cause)); });
    return () => { live = false; void update.then(stop => stop()).catch(() => {}); void open.then(stop => stop()).catch(() => {}); };
  }, []);
  const action = (value: TrayAction) => { void shell.action(value, state.sessionId).catch(cause => setError(errorMessage(cause))); };
  return <main key={opening} className="tray-panel" aria-label="DiscAtelier 托盘" onContextMenu={event => event.preventDefault()} onKeyDown={event => { if (event.key === 'Escape') action('dismiss'); }}>
    <button className="tray-song" onClick={() => action(state.active ? 'player' : 'show')}><Icon name="disc"/><span><strong>{state.active ? state.title : 'DiscAtelier'}</strong><small>{state.active ? state.artist || '正在播放' : '还没有播放音乐'}</small></span></button>
    <div className="tray-transport"><button aria-label="上一首" disabled={!state.active || !state.previous || state.busy} onClick={() => action('previous')}><Icon name="previous"/></button><button aria-label={state.paused ? '继续播放' : '暂停'} disabled={!state.active || state.busy} onClick={() => action('toggle')}><Icon name={state.paused ? 'play' : 'pause'}/></button><button aria-label="下一首" disabled={!state.active || !state.next || state.busy} onClick={() => action('next')}><Icon name="next"/></button></div>
    <button className="tray-row" disabled={!state.active || !state.repeat || state.busy} onClick={() => action('repeat')}><Icon name={state.repeat === 'one' ? 'repeatOne' : 'repeat'}/>{state.repeat === 'one' ? '单曲循环' : '列表循环'}<span>切换</span></button>
    <button className="tray-row" onClick={() => action('show')}><Icon name="menu"/>显示主窗口</button>
    <button className="tray-row" disabled={!state.active} onClick={() => action('player')}><Icon name="disc"/>打开播放界面</button>
    <button className="tray-row" onClick={() => action('settings')}><Icon name="settings"/>设置</button>
    <button className="tray-row tray-quit" onClick={() => action('quit')}><Icon name="close"/>退出 DiscAtelier</button>
    {error && <p className="tray-error" role="alert">{error}</p>}
  </main>;
}
