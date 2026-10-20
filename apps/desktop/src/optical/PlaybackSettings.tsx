import { useEffect, useState } from 'react';
import { errorMessage } from '../library/gateway';
import { optical, type PlaybackSettings as Settings } from './gateway';

export function PlaybackSettings({ onBusy }: { onBusy(value: boolean): void }) {
  const [value, setValue] = useState<Settings>({ mpvExecutable: '', makeMkvLibrary: '', vlcLibrary: '' });
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true;
    optical.settings().then(settings => { if (active) setValue(settings); })
      .catch(cause => { if (active) setError(errorMessage(cause)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  function change(key: keyof Settings, text: string) {
    setValue(current => ({ ...current, [key]: text })); setSaved(false);
  }
  return <form onSubmit={async event => {
    event.preventDefault(); if (busy) return;
    setBusy(true); onBusy(true); setError(''); setSaved(false);
    try { await optical.saveSettings(value); setSaved(true); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); onBusy(false); }
  }}>
    <label>MPV<input value={value.mpvExecutable} onChange={event => change('mpvExecutable', event.target.value)} disabled={busy} spellCheck={false} placeholder="mpv.exe 完整路径；留空自动检测"/></label>
    <label>MakeMKV<input value={value.makeMkvLibrary} onChange={event => change('makeMkvLibrary', event.target.value)} disabled={busy} spellCheck={false} placeholder="libmmbd64.dll 完整路径；可留空"/></label>
    <label>VLC · DVD<input value={value.vlcLibrary} onChange={event => change('vlcLibrary', event.target.value)} disabled={busy} spellCheck={false} placeholder="libvlc.dll 完整路径"/></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <footer className="settings-actions"><button className="solid-button" disabled={busy}>{saved ? '已保存' : busy ? '读取中' : '保存'}</button></footer>
  </form>;
}
