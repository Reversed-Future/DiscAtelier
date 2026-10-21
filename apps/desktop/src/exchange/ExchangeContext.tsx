import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { desktopAvailable, errorMessage } from '../library/gateway';
import { exchange, type ExchangeSettings, type ExchangeStatus } from './gateway';

interface ExchangeController {
  status: ExchangeStatus | null; busy: boolean; error: string;
  refresh(force?: boolean): Promise<void>;
  save(settings: ExchangeSettings, key: string | null, forget?: boolean): Promise<void>;
}
const Context = createContext<ExchangeController | null>(null);
export const useExchange = () => useContext(Context);

export function ExchangeProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ExchangeStatus | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = useRef(false), live = useRef(true), latest = useRef(status);
  latest.current = status;
  async function refresh(force = false) {
    if (pending.current || !desktopAvailable()) return;
    pending.current = true; setBusy(true);
    try {
      const value = await exchange.refresh(force);
      if (live.current) { setStatus(value); setError(''); }
    } catch (e) { if (live.current) setError(errorMessage(e)); }
    finally { pending.current = false; if (live.current) setBusy(false); }
  }
  async function save(settings: ExchangeSettings, key: string | null, forget = false) {
    if (pending.current) throw new Error('汇率正在更新，请稍后保存。');
    pending.current = true; setBusy(true); setError('');
    try {
      const value = await exchange.save(settings, key, forget);
      if (live.current) setStatus(value);
    } catch (e) { if (live.current) setError(errorMessage(e)); throw e; }
    finally { pending.current = false; if (live.current) setBusy(false); }
    if (settings.enabled && !forget) await refresh();
  }
  useEffect(() => {
    live.current = true;
    if (!desktopAvailable()) return;
    void exchange.status().then(value => { if (live.current) { setStatus(value); if (value.settings.enabled) void refresh(); } }).catch(e => { if (live.current) setError(errorMessage(e)); });
    // IPC checks persisted daily state; these checks do not imply HTTP calls.
    const check = () => {
      const value = latest.current, now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      if (value?.settings.enabled && value.hasKey && value.attemptDate < date && Date.now()/1000 - value.lastAttemptAt >= 60) void refresh();
    };
    const interval = setInterval(check, 60_000);
    const resume = () => { if (document.visibilityState === 'visible') check(); };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', resume);
    return () => { live.current = false; clearInterval(interval); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', resume); };
  }, []);
  return <Context.Provider value={{status, busy, error, refresh, save}}>{children}</Context.Provider>;
}
