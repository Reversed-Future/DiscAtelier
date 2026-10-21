import { useEffect, useRef, type RefObject } from 'react';
import { statuses } from '../library/types';
import { enter } from '../ui/motion';
import { assistant } from './gateway';
import type { AssistantController } from './useAssistant';
import { ActionConfirmation } from './ActionConfirmation';

export function AssistantPanel({ controller, open, composer }: {
  controller: AssistantController; open: boolean; composer: RefObject<HTMLTextAreaElement | null>;
}) {
  const { session, text, setText, running, error, logs, setLogs, cancelling, run, send, cancel } = controller;
  const output = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const lastContent = session?.messages.at(-1)?.content;
  useEffect(() => {
    if (open && stick.current && output.current) output.current.scrollTop = output.current.scrollHeight;
  }, [lastContent, open]);
  useEffect(() => {
    if (open && output.current) {
      output.current.scrollTop = output.current.scrollHeight;
      enter(output.current.lastElementChild as HTMLElement, 2);
    }
  }, [open, logs, session?.messages.length]);
  const label = (s: string) => statuses.find(v => v.id === s)?.label || s;
  const change = session?.pending;
  const action = session?.action;
  const confirming = !!change || !!action;
  const messages = session?.messages.filter(m => m.role !== 'tool' && m.content) || [];
  return <>
    <div className="assistant-toolbar"><button className="text-button" disabled={running || confirming || !session} onClick={() => void run(assistant.newSession)}>新会话</button><button className="text-button" aria-pressed={logs} onClick={() => setLogs(v => !v)}>{logs ? '返回对话' : '操作记录'}</button></div>
    {logs ? <div className="assistant-log" data-long-scroll>{session?.events.map((e,i) => <p key={i}>{e}</p>)}{!session?.events.length && <p className="setting-hint">暂无操作记录</p>}</div> : <div className="assistant-messages" ref={output} onScroll={e => { const node = e.currentTarget; stick.current = node.scrollHeight - node.scrollTop - node.clientHeight < 50; }} role="log" aria-label="对话消息" aria-live={open && !running ? 'polite' : 'off'} data-long-scroll>
      {!messages.length && !running && <p className="assistant-empty">{session ? '今天想听点什么？也可以聊聊你最近喜欢的音乐。' : error ? '会话暂不可用，请稍后重试。' : '正在读取会话'}</p>}
      {messages.map((m,i) => <article key={i} data-role={m.role}>{m.content}</article>)}
      {running && <p className="setting-hint" role="status">{cancelling ? '正在停止' : lastContent && session?.messages.at(-1)?.role === 'assistant' ? '正在回复…' : '正在想…'}</p>}
    </div>}
    {change && session && <div className="assistant-confirm"><strong>{change.title}</strong><span>{label(change.before.status)} → {label(change.request.copy.status)}</span><div><button className="text-button" disabled={running} onClick={() => void run(() => assistant.decide(session.id, change.request.requestId, false))}>取消</button><button className="solid-button" disabled={running} onClick={() => void run(() => assistant.decide(session.id, change.request.requestId, true), true)}>确认修改</button></div></div>}
    {action && session && <ActionConfirmation action={action} busy={running} decide={approve => void run(() => assistant.decide(session.id, action.id, approve), approve)}/>}
    {!confirming && session?.undo && <button className="text-button assistant-undo" disabled={running} onClick={() => void run(() => assistant.decide(session.id, session.undo!.request.requestId, true, true), true)}>撤销上次状态修改</button>}
    {(error || session?.error) && <p className="form-error" role="alert">{error || session?.error}</p>}
    <form className="assistant-composer" onSubmit={e => { e.preventDefault(); void send(); }}><textarea ref={composer} aria-label="向助手提问" placeholder="聊点什么，或告诉我你想做的事…" rows={2} value={text} disabled={confirming} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}/>
      {running ? <button type="button" className="text-button" disabled={cancelling} onClick={cancel}>停止</button> : <button className="solid-button" disabled={!text.trim() || confirming || !session}>发送</button>}
    </form>
  </>;
}
