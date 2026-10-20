import type { ModelHandle } from '../../../../packages/atelier-model-runtime';
import { renderedPreviews } from './rendered-previews';

/** No extra WebGL viewer: capture the selected, closed model after its first paint. */
export function schedulePreview(assetId: string, handle: ModelHandle, host: HTMLElement, initialState: string, signal: AbortSignal, isInteractive: () => boolean) {
  let idle: number | undefined;
  const timer = window.setTimeout(() => {
    idle = window.requestIdleCallback(() => { void capture(); }, { timeout: 1500 });
  }, 320);
  async function capture() {
    if (signal.aborted || isInteractive()) return;
    const previous = await renderedPreviews.get(assetId);
    if (signal.aborted || isInteractive() || handle.state.busy || handle.state.held || handle.state.stateId !== initialState) return;
    const canvas = host.querySelector('canvas');
    if (!canvas || (previous && previous.width >= canvas.width && previous.height >= canvas.height)) return;
    try {
      const start = performance.now();
      const value = await handle.capturePreview();
      performance.measure('model.preview_capture', { start, end: performance.now() });
      if (!signal.aborted) await renderedPreviews.put(assetId, value);
    } catch { /* Preview generation is optional; retain the authored preview. */ }
  }
  return () => { clearTimeout(timer); if (idle !== undefined) cancelIdleCallback(idle); };
}
