import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ModelHandle } from '../../../../packages/atelier-model-runtime';
import type { LibraryCopy } from '../library/types';
import { ModelView } from '../models/ModelView';
import { ModelPreview } from '../models/ModelPreview';
import { Cover } from './Cover';
import { createArtworkMotion } from './artwork-motion';

export function useCollectionArtwork(item: LibraryCopy | undefined, active: boolean, inspecting: boolean) {
  const [container] = useState(() => { const node = document.createElement('div'); node.className = 'shared-artwork'; return node; });
  const [shelf, shelfRef] = useState<HTMLDivElement | null>(null);
  const [inspection, inspectionRef] = useState<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState('shelf');
  const [busy, setBusy] = useState(false);
  const handle = useRef<ModelHandle | null>(null);
  const motion = useRef(createArtworkMotion());
  const revision = useRef(0);
  const ready = useCallback((value: ModelHandle | null) => { handle.current = value; }, []);
  useLayoutEffect(() => {
    const version = ++revision.current;
    if (!active || !item) { motion.current.cancel(); container.remove(); return; }
    if (inspecting && !inspection) return;
    const destination = inspecting ? inspection : shelf;
    if (!destination) { container.remove(); return; }
    const from = container.isConnected ? container.getBoundingClientRect() : destination.getBoundingClientRect();
    motion.current.cancel();
    destination.appendChild(container);
    handle.current?.setInteractive(false);
    container.dataset.item = item.id;
    container.dataset.category = item.edition.categoryId;
    if (inspecting) {
      setPhase('opening');
      void motion.current.move(container, from, container.getBoundingClientRect()).then(() => {
        if (revision.current === version) setPhase('inspection');
      });
    } else setPhase('shelf');
  }, [active, item?.id, inspection, inspecting, shelf, container]);
  useEffect(() => () => { motion.current.cancel(); container.remove(); }, [container]);

  const prepareClose = async () => {
    ++revision.current;
    if (phase !== 'opening') await handle.current?.reset();
    setPhase('returning');
    const current = container.getBoundingClientRect();
    // Keep the object in the modal top layer until it reaches its shelf slot.
    const destination = shelf?.getBoundingClientRect() || current;
    const dialog = inspection?.closest('dialog');
    dialog?.setAttribute('data-departing', 'true');
    await motion.current.move(container, current, destination, true);
  };
  const portal = active && item ? createPortal(
    item.modelAssetId
      ? <ModelView assetId={item.modelAssetId} enabled={inspecting} visible={inspecting && phase === 'inspection'} interactive={inspecting && phase === 'inspection'} onReady={ready} onBusy={setBusy} fallback={
        <ModelPreview assetId={item.modelAssetId} authored={!item.coverAssetId} fallback={<Cover edition={item.edition} assetId={item.coverAssetId}/>}/>}/>
      : <div className="physical-case"><Cover edition={item.edition} assetId={item.coverAssetId}/></div>,
    container,
  ) : null;
  return { portal, shelfRef, inspectionRef, prepareClose, busy };
}
