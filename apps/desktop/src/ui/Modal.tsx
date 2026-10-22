import { useEffect, useRef, type ReactNode } from 'react';
import { enter, leave } from './motion';
import { Icon } from './Icon';

export function Modal({ title, children, onClose, busy = false, wide = false, inspection = false, className = '', beforeClose, shared = false }: {
  title: string; children: ReactNode; onClose(): void; busy?: boolean; wide?: boolean; inspection?: boolean; className?: string; beforeClose?(): Promise<void>; shared?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closing = useRef(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal(); if (!shared) enter(dialog, inspection ? 0 : 6);
    return () => {
      dialog?.close();
      if (previous?.isConnected && previous.getClientRects().length && !previous.closest('dialog:not([open]), [popover]:not(:popover-open)')) previous.focus();
      else document.getElementById('tools-toggle')?.focus();
    };
  }, [inspection, shared]);
  async function close() {
    if (busy || closing.current) return;
    closing.current = true;
    // Fade the inspection chrome immediately, even while the model reassembles.
    if (inspection && shared) ref.current?.setAttribute('data-exiting', 'true');
    try { await beforeClose?.(); } catch {
      ref.current?.removeAttribute('data-exiting');
      closing.current = false; return;
    }
    ref.current?.setAttribute('data-closing', 'true');
    if (!shared) await leave(ref.current);
    if (!shared) ref.current?.close();
    onClose();
  }
  return <dialog ref={ref} aria-label={title} className={inspection ? `inspection-dialog ${className}` : 'window-modal'}
    onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button, input, textarea, a[href], [tabindex]')]
        .filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && !node.closest('[inert]') && node.getClientRects().length > 0);
      if (!controls.length) { event.preventDefault(); return; }
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}
    onCancel={event => {
      event.preventDefault(); event.stopPropagation();
      // A file input emits a bubbling cancel event when its chooser is dismissed.
      // It is not a request to close this editor (or any enclosing dialog).
      if (event.target === event.currentTarget) void close();
    }}>
    {inspection ? <>
      <button type="button" className="return-button" onClick={() => void close()} disabled={busy}><Icon name="back"/>放回</button>
      {children}
    </> : <section className={`panel-dialog${wide ? ' wide-panel' : ''} ${className}`}>
      <div className="panel-heading" data-window-drag="true"><h2>{title}</h2><button type="button" className="icon-button" aria-label="关闭" disabled={busy} onClick={() => void close()}><Icon name="close"/></button></div>
      <div className="panel-body">{children}</div>
    </section>}
  </dialog>;
}
