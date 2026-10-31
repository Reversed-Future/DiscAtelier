import { useRef, useState, type PointerEvent } from 'react';

/** Pointer capture keeps in-app sorting independent of native file-drop handling. */
export function useCollectionDrag(items: { id: string }[], disabled: boolean, move: (id: string, before: string | null) => Promise<void>) {
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; pointer: number } | null>(null);
  const target = useRef<{ id: string; after: boolean } | null>(null);
  const [over, setOver] = useState<typeof target.current>(null);
  function cancel() { drag.current = null; target.current = null; setOver(null); }
  function locate(event: PointerEvent<HTMLButtonElement>) {
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLTableRowElement>('tr[data-collection-id]');
    if (!row || !root.current?.contains(row)) return null;
    const id = row.dataset.collectionId!;
    if (!items.some(item => item.id === id)) return null;
    const rect = row.getBoundingClientRect();
    return { id, after: event.clientY > rect.top + rect.height / 2 };
  }
  return { root, over, cancel, bind: (id: string) => ({
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      if (disabled || event.button !== 0) return;
      event.preventDefault(); event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { id, pointer: event.pointerId };
    },
    onPointerMove(event: PointerEvent<HTMLButtonElement>) {
      if (!drag.current || event.pointerId !== drag.current.pointer) return;
      target.current = locate(event); setOver(target.current);
    },
    onPointerUp(event: PointerEvent<HTMLButtonElement>) {
      if (!drag.current || event.pointerId !== drag.current.pointer) return;
      const moving = drag.current.id, next = locate(event);
      cancel();
      if (next && next.id !== moving) {
        const index = items.findIndex(item => item.id === next.id);
        void move(moving, next.after ? items[index + 1]?.id || null : next.id);
      }
    },
    onPointerCancel: cancel,
    onLostPointerCapture: cancel,
  }) };
}
