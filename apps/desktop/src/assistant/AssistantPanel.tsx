import { useEffect, useRef, useState } from 'react';
import { Modal } from '../ui/Modal';
import { errorMessage } from '../library/gateway';
import { statuses } from '../library/types';
import { enter } from '../ui/motion';
import { assistant, type AgentSession } from './gateway';

export function AssistantPanel({ onClose, onChanged }: { onClose(): void; onChanged(): void }) {
  const [session, setSession] = useState<AgentSession | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [logs, setLogs] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const live = useRef(true), pending = useRef(false), revision = useRef(0), output = useRef<HTMLDivElement>(null);
  const running = busy || session?.phase === 'running';
  useEffect(() => {
    live.current = true; let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const version = revision.current;
      try { const value = await assistant.snapshot(); if (live.current && version === revision.current && (!pending.current || value.phase === 'running')) setSession(value); }
      catch (e) { if (live.current) setError(errorMessage(e)); }
      if (live.current) timer = setTimeout(poll, 1000);
    }
    void poll(); return () => { live.current = false; clearTimeout(timer); };
  }, []);
  useEffect(() => { if (output.current) { output.current.scrollTop = output.current.scrollHeight; enter(output.current.lastElementChild as HTMLElement, 2); } }, [session?.messages.length]);
  async function run(action: () => Promise<AgentSession>, changed = false) {
    if (pending.current) return false;
    pending.current = true; revision.current++; setBusy(true); setError('');
    try { const value = await action(); if (live.current) { setSession(value); if (changed) onChanged(); } return true; }
    catch (e) { if (live.current) setError(errorMessage(e)); return false; }
    finally { pending.current = false; revision.current++; if (live.current) { setBusy(false); setCancelling(false); } }
  }
  async function send() { if (!text.trim() || running || session?.pending) return; const value = text; if (await run(() => assistant.send(value))) setText(current => current === value ? '' : current); }
  const label = (s: string) => statuses.find(v => v.id === s)?.label || s;
  const change = session?.pending;
  return <Modal title="助手" onClose={onClose} className="assistant-panel">
    <div className="assistant-toolbar"><button className="text-button" disabled={running || !!change} onClick={() => void run(assistant.newSession)}>新会话</button><button className="text-button" aria-expanded={logs} onClick={() => setLogs(v => !v)}>操作记录</button></div>
    {logs ? <div className="assistant-log">{session?.events.map((e,i) => <p key={i}>{e}</p>)}</div> : <div className="assistant-messages" ref={output} aria-live="polite">{session?.messages.filter(m => m.role !== 'tool' && m.content).map((m,i) => <article key={i} data-role={m.role}>{m.content}</article>)}{running && <p className="setting-hint">{cancelling ? '正在停止' : '处理中'}</p>}</div>}
    {change && session && <div className="assistant-confirm"><strong>{change.title}</strong><span>{label(change.before.status)} → {label(change.request.copy.status)}</span><div><button className="text-button" disabled={running} onClick={() => void run(() => assistant.decide(session.id, change.request.requestId, false))}>取消</button><button className="solid-button" disabled={running} onClick={() => void run(() => assistant.decide(session.id, change.request.requestId, true), true)}>确认修改</button></div></div>}
    {!change && session?.undo && <button className="text-button assistant-undo" disabled={running} onClick={() => void run(() => assistant.decide(session.id, session.undo!.request.requestId, true, true), true)}>撤销上次状态修改</button>}
    {(error || session?.error) && <p className="form-error" role="alert">{error || session?.error}</p>}
    <form className="assistant-composer" onSubmit={e => { e.preventDefault(); void send(); }}><textarea aria-label="向助手提问" rows={2} value={text} disabled={!!change} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}/>
      {running ? <button type="button" className="text-button" disabled={cancelling} onClick={() => { setCancelling(true); void assistant.cancel().catch(e => { setError(errorMessage(e)); setCancelling(false); }); }}>停止</button> : <button className="solid-button" disabled={!text.trim() || !!change}>发送</button>}
    </form>
  </Modal>;
}
