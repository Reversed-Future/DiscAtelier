import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { statuses } from '../library/types';
import { enter } from '../ui/motion';
import { Icon } from '../ui/Icon';
import { assistant } from './gateway';
import type { AssistantController } from './useAssistant';
import { ActionConfirmation } from './ActionConfirmation';
import { Markdown } from './MarkdownView';
import { SessionHistory } from './SessionHistory';
import { cardsByReply } from './replyCards';
import { CollectionReplyCards } from './CollectionReplyCards';
import { AssistantHeader } from './AssistantHeader';

const exampleQuestions = ['我有哪些在途的收藏？', '我收藏了哪些蓝光版本？'];

export function AssistantPanel({ controller, open, composer, onClose }: {
  controller: AssistantController; open: boolean; composer: RefObject<HTMLTextAreaElement | null>;
  onClose(): void;
}) {
  const { session, text, setText, sending, running, error, view, setView, cancelling, run, send, retry, cancel } = controller;
  const output = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const lastContent = session?.messages.at(-1)?.content;
  const replyCards = useMemo(() => cardsByReply(session?.messages || []), [session?.messages]);
  useEffect(() => {
    if (open && stick.current && output.current) output.current.scrollTop = output.current.scrollHeight;
  }, [lastContent, open]);
  useEffect(() => {
    if (open && output.current) {
      output.current.scrollTop = output.current.scrollHeight;
      enter(output.current.lastElementChild as HTMLElement, 2);
    }
  }, [open, view, session?.messages.length]);
  const label = (s: string) => statuses.find(v => v.id === s)?.label || s;
  const change = session?.pending;
  const action = session?.action;
  const confirming = !!change || !!action;
  const messages = session?.messages.filter(m => m.role !== 'tool' && m.content) || [];
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  const visible = sending && lastUser?.content !== sending ? [...messages, { role: 'user', content: sending }] : messages;
  function navigate(next: AssistantController['view']) {
    setView(next);
    if (next === 'chat') requestAnimationFrame(() => composer.current?.focus({ preventScroll: true }));
  }
  return <>
    <AssistantHeader view={view} navigate={navigate} disableNew={running || confirming || !session}
      onNew={async () => { if (await run(assistant.newSession)) navigate('chat'); }} onClose={onClose}/>
    {view === 'history' ? <SessionHistory activeId={session?.id} disabled={running || confirming} onSelect={async id => {
      if (id === session?.id || await run(() => assistant.resume(id))) navigate('chat');
    }}/> : view === 'logs' ? <div className="assistant-log" data-long-scroll>{session?.events.map((e,i) => <p key={i}>{e}</p>)}{!session?.events.length && <p className="setting-hint">暂无操作记录</p>}</div> : <div className="assistant-messages" ref={output} onScroll={e => { const node = e.currentTarget; stick.current = node.scrollHeight - node.scrollTop - node.clientHeight < 50; }} role="log" aria-label="对话消息" aria-live={open && !running ? 'polite' : 'off'}>
      {!session && !error && !running && <p className="setting-hint" role="status">正在读取会话</p>}
      {session && !visible.length && !running && !confirming && !text && !error && !session.error &&
        <div className="assistant-starters" role="group" aria-labelledby="assistant-examples-label">
          <p id="assistant-examples-label">试着问</p>
          {exampleQuestions.map(question => <button key={question} type="button" onClick={() => {
            setText(question);
            composer.current?.focus({ preventScroll: true });
          }}>{question}<Icon name="back"/></button>)}
        </div>}
      {visible.map((m,i) => m.role === 'user'
        ? <div className="assistant-user-row" key={i}>
            <article data-role="user" data-sending={sending && m.content === sending ? 'true' : undefined}>{m.content}</article>
            {m === lastUser && !running && !confirming && !sending && <button type="button" className="assistant-retry" aria-label="重试" title="重试" disabled={running || confirming} onClick={() => void retry()}><Icon name="rotate"/></button>}
          </div>
        : <article key={i} data-role="assistant"><Markdown text={m.content || ''}/>
            {open && replyCards.has(m) && <CollectionReplyCards cards={replyCards.get(m)!}/>}
          </article>)}
      {running && <p className="setting-hint" role="status">{cancelling ? '正在停止' : lastContent && session?.messages.at(-1)?.role === 'assistant' ? '正在回复…' : '正在想…'}</p>}
    </div>}
    {change && session && <div className="assistant-confirm"><strong>{change.title}</strong><span>{label(change.before.status)} → {label(change.request.copy.status)}</span><div><button className="text-button" disabled={running} onClick={() => void run(() => assistant.decide(session.id, change.request.requestId, false))}>取消</button><button className="solid-button" disabled={running} onClick={() => void run(() => assistant.decide(session.id, change.request.requestId, true), true)}>确认修改</button></div></div>}
    {action && session && <ActionConfirmation action={action} busy={running} decide={approve => void run(() => assistant.decide(session.id, action.id, approve), approve)}/>}
    {!confirming && session?.undo && <button className="text-button assistant-undo" disabled={running} onClick={() => void run(() => assistant.decide(session.id, session.undo!.request.requestId, true, true), true)}>撤销上次状态修改</button>}
    {(error || session?.error) && <p className="form-error" role="alert">{error || session?.error}</p>}
    {view === 'chat' && <form className="assistant-composer" data-sending={!!sending} onSubmit={e => { e.preventDefault(); void send(); }}>
      <div className="assistant-input">
        <textarea ref={composer} aria-label="向助手提问" placeholder="聊点什么，或告诉我你想做的事…" rows={2} value={text} disabled={confirming} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}/>
        {running
          ? <button type="button" className="assistant-send assistant-stop" disabled={cancelling} onClick={cancel}>{cancelling ? '停止中' : '停止'}</button>
          : <button type="submit" className="assistant-send" disabled={!text.trim() || confirming || !session}>发送</button>}
      </div>
    </form>}
  </>;
}
