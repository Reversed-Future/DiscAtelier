import { useEffect, useRef, type ReactNode } from 'react';

/** Put the player in the browser's top layer so an open collection detail
 * dialog stays mounted underneath and returns without a shelf flash. */
export function PlayerLayer({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className="player-layer" aria-label="播放器">{children}</dialog>;
}
