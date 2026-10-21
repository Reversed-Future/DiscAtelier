import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../ui/Icon';
import { useFloatingLayer } from '../ui/useFloatingLayer';
import { AssistantPanel } from './AssistantPanel';
import { useAssistant } from './useAssistant';
import '../styles/assistant-dock.css';

export function AssistantDock({ open, hidden, onOpen, onChanged }: {
  open: boolean; hidden: boolean; onOpen(value: boolean): void; onChanged(): void;
}) {
  const host = useFloatingLayer();
  // Keep drafts and in-flight requests above the portal so changing pages cannot reset them.
  const controller = useAssistant(open && !hidden, onChanged);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const close = () => { onOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open || hidden) return;
    const initialFocus = composer.current?.disabled
      ? root.current?.querySelector<HTMLButtonElement>('.assistant-confirm button:not(:disabled), .assistant-action button:not(:disabled)')
      : composer.current;
    initialFocus?.focus({ preventScroll: true });
    const pointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation(); onOpen(false); trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', pointer, true); document.removeEventListener('keydown', key, true); };
  }, [open, hidden, host]);
  if (hidden) return null;
  const waiting = !!controller.session?.pending || !!controller.session?.action;
  return createPortal(<div className="assistant-dock" ref={root}>
    <section className="assistant-dock-panel" id="assistant-chat" role="dialog" aria-modal="false" aria-labelledby="assistant-chat-title" data-open={open} inert={!open}>
      <header className="assistant-dock-heading"><h3 id="assistant-chat-title">助手</h3><button className="icon-button" aria-label="收起助手" onClick={close}><Icon name="close"/></button></header>
      <AssistantPanel controller={controller} open={open} composer={composer}/>
    </section>
    <button ref={trigger} className="assistant-dock-trigger" aria-label={waiting ? '助手 · 有待确认的修改' : controller.running ? '助手 · 处理中' : '助手'} aria-expanded={open} aria-controls="assistant-chat" title="助手" onClick={() => onOpen(!open)}>
      <Icon name="chat"/><span className="assistant-dock-indicator" data-running={controller.running} data-waiting={waiting}/>
    </button>
  </div>, host);
}
