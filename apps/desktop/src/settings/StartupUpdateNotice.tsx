import { useEffect, useState } from 'react';
import { desktopAvailable } from '../library/gateway';
import { useFadePresence } from '../ui/useFadePresence';
import { updates, type UpdateStatus } from './gateway';
import { ignoredUpdate, ignoreUpdate, shouldNotifyUpdate, startupUpdateCheck } from './startupUpdates';

const checkAtStartup = startupUpdateCheck(() => updates.check());

export function StartupUpdateNotice({ hidden, onReview }: { hidden: boolean; onReview(): void }) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!desktopAvailable()) return;
    let live = true;
    void checkAtStartup().then(value => {
      let ignored: string | null = null;
      try { ignored = ignoredUpdate(localStorage); } catch { /* Storage may be unavailable. */ }
      if (live && shouldNotifyUpdate(value, ignored)) setStatus(value);
    });
    return () => { live = false; };
  }, []);
  const visible = !!status?.available && !dismissed && !hidden;
  const fade = useFadePresence<HTMLElement>(visible);
  if (!fade.mounted || !status?.available) return null;
  return <aside ref={fade.ref} className="startup-update-notice fade-notice" data-shown={fade.shown} inert={fade.inert} aria-hidden={fade.inert} aria-label="软件更新提示">
    <p aria-live="polite">发现新版本 {status.available.version}</p>
    <div className="startup-update-actions">
      <button type="button" className="text-button" onClick={() => {
        try { ignoreUpdate(localStorage, status.available!.version); setDismissed(true); }
        catch { setError('无法保存忽略设置，请稍后重试。'); }
      }}>忽略此版本</button>
      <button type="button" className="text-button" onClick={() => setDismissed(true)}>稍后</button>
      <button type="button" className="solid-button" onClick={() => { setDismissed(true); onReview(); }}>查看更新</button>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </aside>;
}
