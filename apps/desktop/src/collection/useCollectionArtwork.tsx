import type { VideoMetadata } from '../video/gateway';
import { VideoPartCards } from '../video/VideoPartCards';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ModelHandle } from '../../../../packages/atelier-model-runtime';
import type { LibraryCopy } from '../library/types';
import { ModelView } from '../models/ModelView';
import { ModelPreview } from '../models/ModelPreview';
import { Cover } from './Cover';
import { loadStaticArtwork } from '../library/static-artwork-cache';
import { ARTWORK_MOTION_DURATION, ARTWORK_MOTION_EASING, createArtworkMotion } from './artwork-motion';

export function useCollectionArtwork(item: LibraryCopy | undefined, active: boolean, inspecting: boolean, metadata: VideoMetadata | null, partId: string, instantFlip: boolean) {
  const [container] = useState(() => { const node = document.createElement('div'); node.className = 'shared-artwork'; return node; });
  const [shelf, shelfRef] = useState<HTMLDivElement | null>(null);
  const [inspection, inspectionRef] = useState<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState('shelf');
  const [busy, setBusy] = useState(false);
  const [cover, setCover] = useState<{ assetId: string; url: string } | null>(null);
  const handle = useRef<ModelHandle | null>(null);
  const motion = useRef(createArtworkMotion());
  const revision = useRef(0);
  const ready = useCallback((value: ModelHandle | null) => { handle.current = value; }, []);
  useEffect(() => {
    let live = true;
    if (!active || !item?.coverAssetId) { setCover(null); return; }
    // The detail portal mounts a fresh Cover. Keep this item's decoded URL
    // pinned in component state so cache eviction cannot force another scan.
    void loadStaticArtwork('cover', item.coverAssetId).then(value => {
      if (live) setCover({ assetId: item.coverAssetId!, url: value.url });
    }).catch(() => { /* The Cover component owns the empty/error fallback. */ });
    return () => { live = false; };
  }, [active, item?.coverAssetId]);
  useLayoutEffect(() => {
    const version = ++revision.current;
    if (!active || !item) { motion.current.cancel(); container.remove(); return; }
    // Keep the portal mounted while the item is current, even outside detail.
    // It lives detached from the document, so its cover stays decoded and the
    // next open can append it without a blank frame.
    if (!inspecting) {
      motion.current.cancel();
      container.remove();
      setPhase('shelf');
      return;
    }
    if (!inspection) return;
    const from = container.isConnected
      ? container.getBoundingClientRect()
      : shelf?.isConnected
        ? shelf.getBoundingClientRect()
        : inspection.getBoundingClientRect();
    motion.current.cancel();
    inspection.appendChild(container);
    handle.current?.setInteractive(false);
    container.dataset.item = item.id;
    container.dataset.category = item.edition.categoryId;
    setPhase('opening');
    void motion.current.move(container, from, container.getBoundingClientRect()).then(() => {
      if (revision.current === version) setPhase('inspection');
    });
  }, [active, item?.id, inspection, inspecting, shelf, container]);
  useEffect(() => () => { motion.current.cancel(); container.remove(); }, [container]);

  const prepareClose = async () => {
    ++revision.current;
    if (phase !== 'opening') await handle.current?.reset();
    setPhase('returning');
    const current = container.getBoundingClientRect();
    const dialog = inspection?.closest('dialog');
    // List mode has no shelf slot. Fade the shared cover out before closing;
    // removing it immediately looked abrupt.
    const destination = shelf?.isConnected ? shelf.getBoundingClientRect() : null;
    if (!destination) {
      motion.current.cancel();
      dialog?.setAttribute('data-departing', 'true');
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        container.remove();
        return;
      }
      const animation = container.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: ARTWORK_MOTION_DURATION, easing: ARTWORK_MOTION_EASING, fill: 'forwards' },
      );
      await animation.finished.catch(() => {});
      container.remove();
      // `fill: forwards` leaves opacity 0 on the detached node. Cancel it
      // before the next open or the reopened cover is invisible until close.
      animation.cancel();
      container.style.opacity = '';
      return;
    }
    // Keep the object in the modal top layer until it reaches its shelf slot.
    dialog?.setAttribute('data-departing', 'true');
    await motion.current.move(container, current, destination, true);
  };
  // Browsing uses persistent sleeve images. Only inspection needs the moving
  // portal, so changing selection cannot replace a visible decoded cover.
  const coverUrl = cover && cover.assetId === item?.coverAssetId ? cover.url : '';
  const portal = active && item ? createPortal(
    metadata?.parts?.length === 2 ? <VideoPartCards item={item} metadata={metadata} activeId={partId} instant={instantFlip}/> : item.modelAssetId
      ? <ModelView assetId={item.modelAssetId} enabled={inspecting} visible={inspecting && phase === 'inspection'} interactive={inspecting && phase === 'inspection'} onReady={ready} onBusy={setBusy} fallback={
        <ModelPreview assetId={item.modelAssetId} authored={!item.coverAssetId} fallback={<Cover edition={item.edition} assetId={item.coverAssetId} preloadedUrl={coverUrl}/>}/>}/>
      : <div className="physical-case"><Cover edition={item.edition} assetId={item.coverAssetId} preloadedUrl={coverUrl}/></div>,
    container,
  ) : null;
  return { portal, shelfRef, inspectionRef, prepareClose, busy };
}
