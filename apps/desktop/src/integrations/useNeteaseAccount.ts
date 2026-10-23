import { useEffect, useRef, useState } from 'react';
import { accountApi, type NeteaseAccountState } from './accountGateway';
import { errorMessage } from '../library/gateway';
type Qr = { id: string; image: string; phase: 'loading' | 'waiting' | 'confirming' | 'expired' | 'error' };

let cachedAccount: NeteaseAccountState | null = null;
function sameAccount(left: NeteaseAccountState | null, right: NeteaseAccountState | null) {
  return left === right || (!!left && !!right
    && left.state === right.state
    && left.nickname === right.nickname
    && left.avatarUrl === right.avatarUrl);
}
function remember(value: NeteaseAccountState) {
  if (sameAccount(cachedAccount, value)) return false;
  cachedAccount = value;
  return true;
}

export function useNeteaseAccount(enabled: boolean) {
  const [account, setAccount] = useState<NeteaseAccountState | null>(cachedAccount);
  const [checking, setChecking] = useState(enabled && !cachedAccount);
  const [qr, setQr] = useState<Qr | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const current = useRef<string | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let live = true;
    if (enabled) {
      if (!cachedAccount) setChecking(true);
      void accountApi.status().then(value => {
        if (!live || current.current) return;
        if (remember(value)) setAccount(value);
        setChecking(false);
      }).catch(e => { if (live) { setChecking(false); setError(errorMessage(e)); } });
    } else setChecking(false);
    return () => {
      live = false; mounted.current = false;
      const id = current.current; current.current = null;
      if (id) void accountApi.cancel(id).catch(() => {});
    };
  }, [enabled]);
  useEffect(() => {
    if (!qr?.image) return;
    const id = qr.id;
    let live = true, timer: ReturnType<typeof setTimeout>;
    async function check() {
      try {
        const result = await accountApi.poll(id);
        if (!live || current.current !== id) return;
        if (result.phase === 'loggedIn') {
          current.current = null;
          if (result.account && remember(result.account)) setAccount(result.account);
          setQr(null); setError(''); return;
        }
        setQr(value => value?.id === id ? { ...value, phase: result.phase as Qr['phase'] } : value);
        if (result.phase !== 'expired') timer = setTimeout(check, 3000);
      } catch (e) {
        if (live && current.current === id) { setError(errorMessage(e)); setQr(value => value?.id === id ? { ...value, phase: 'error' } : value); }
      }
    }
    timer = setTimeout(check, 3000);
    return () => { live = false; clearTimeout(timer); };
  }, [qr?.id, qr?.image]);
  async function begin() {
    if (!enabled || busy) return;
    const old = current.current;
    if (old) void accountApi.cancel(old).catch(() => {});
    const id = crypto.randomUUID(); current.current = id;
    setError(''); setQr({ id, image: '', phase: 'loading' });
    try {
      const value = await accountApi.begin(id);
      if (mounted.current && current.current === id) setQr({ id, image: value.image, phase: 'waiting' });
      else void accountApi.cancel(id).catch(() => {});
    } catch (e) {
      if (mounted.current && current.current === id) { setError(errorMessage(e)); setQr({ id, image: '', phase: 'error' }); }
    }
  }
  function cancel() {
    const id = current.current; current.current = null; setQr(null); setError('');
    if (id) void accountApi.cancel(id).catch(() => {});
  }
  async function logout() {
    if (busy) return;
    cancel(); setBusy(true);
    try {
      const value = await accountApi.logout();
      if (mounted.current && remember(value)) setAccount(value);
    }
    catch (e) { if (mounted.current) setError(errorMessage(e)); }
    finally { if (mounted.current) setBusy(false); }
  }
  return { account, checking, qr, error, busy, begin, cancel, logout };
}
