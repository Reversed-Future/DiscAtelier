import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../library/gateway';
import { assistant, type AgentSession } from './gateway';

export function useAssistant(open: boolean, onChanged: () => void) {
  const [session, setSession] = useState<AgentSession | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [logs, setLogs] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const live = useRef(true), pending = useRef(false), revision = useRef(0);
  const onChangedRef = useRef(onChanged); onChangedRef.current = onChanged;
  const running = busy || session?.phase === 'running';
  const pollEnabled = open || running;
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    if (!pollEnabled) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const version = revision.current;
      try {
        const value = await assistant.snapshot();
        if (active && version === revision.current && !pending.current) setSession(value);
      } catch (cause) { if (active) setError(errorMessage(cause)); }
      if (active) timer = setTimeout(poll, 1000);
    }
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [pollEnabled]);

  async function run(action: () => Promise<AgentSession>, changed = false) {
    if (pending.current) return false;
    pending.current = true; revision.current++; setBusy(true); setError('');
    try {
      const value = await action();
      if (live.current) { setSession(value); if (changed) onChangedRef.current(); }
      return true;
    } catch (cause) { if (live.current) setError(errorMessage(cause)); return false; }
    finally { pending.current = false; revision.current++; if (live.current) { setBusy(false); setCancelling(false); } }
  }
  function listener(version: number) {
    return (update: AgentSession) => { if (live.current && pending.current && version === revision.current) setSession(update); };
  }
  async function send() {
    if (!text.trim() || running || !session || session.pending || session.action) return;
    const value = text;
    setText('');
    setSending(value);
    try {
      await run(() => {
        const version = revision.current;
        return assistant.send(value, listener(version));
      });
    } finally { if (live.current) setSending(''); }
  }
  async function retry() {
    if (running || !session || session.pending || session.action) return;
    await run(() => {
      const version = revision.current;
      return assistant.retry(listener(version));
    });
  }
  function cancel() {
    setCancelling(true);
    void assistant.cancel().catch(cause => { if (live.current) { setError(errorMessage(cause)); setCancelling(false); } });
  }
  return { session, text, setText, sending, running, error, logs, setLogs, cancelling, run, send, retry, cancel };
}
export type AssistantController = ReturnType<typeof useAssistant>;
