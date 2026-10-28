import { useEffect, useRef, useState, type ReactNode } from 'react';
import { mountModel, type ModelHandle, type ModelState } from '../../../../packages/atelier-model-runtime';
import { loadModel } from './assets';
import { measureAsync } from './timing';
import { errorMessage } from '../library/gateway';

interface ModelViewProps {
  assetId: string; fallback: ReactNode; interactive?: boolean; enabled?: boolean; visible?: boolean;
  onReady?(handle: ModelHandle | null): void; onBusy?(busy: boolean): void;
}
export function ModelView(props: ModelViewProps) {
  return <ModelSession key={props.assetId} {...props}/>;
}
function ModelSession({ assetId, fallback, interactive = false, enabled = true, visible = true, onReady, onBusy }: ModelViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<ModelHandle | null>(null);
  const callbacks = useRef({ onReady, onBusy }); callbacks.current = { onReady, onBusy };
  const interaction = useRef(interactive); interaction.current = interactive;
  const [state, setState] = useState<ModelState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const previousInteraction = useRef(interactive);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setLoaded(false); setError(''); setState(null);
    async function start() {
      try {
        const model = await measureAsync('display_load', () => loadModel(assetId, controller.signal));
        controller.signal.throwIfAborted();
        const mounted = await measureAsync('display_mount', () => mountModel(host.current!, model, {
          interactive: interaction.current, signal: controller.signal,
          onChange: next => { if (!controller.signal.aborted) { setState(next); callbacks.current.onBusy?.(next.busy); } },
          onError: cause => { if (!controller.signal.aborted) setError(errorMessage(cause)); },
        }));
        if (controller.signal.aborted) { mounted.dispose(); return; }
        handle.current = mounted; mounted.setInteractive(interaction.current); callbacks.current.onReady?.(mounted); setLoaded(true);
        host.current?.querySelector('canvas')?.addEventListener('webglcontextlost', event => {
          event.preventDefault();
          mounted.dispose(); handle.current = null;
          callbacks.current.onReady?.(null); callbacks.current.onBusy?.(false);
          setLoaded(false); setError('模型显示中断，重新打开可重试。');
        }, { once: true, signal: controller.signal });
      } catch (cause) { if (!controller.signal.aborted) setError(errorMessage(cause)); }
    }
    void start();
    return () => {
      controller.abort(); handle.current = null;
      setLoaded(false); setState(null);
      callbacks.current.onReady?.(null); callbacks.current.onBusy?.(false);
    };
  }, [assetId, retry, enabled]);
  useEffect(() => {
    handle.current?.setInteractive(interactive);
    if (previousInteraction.current !== interactive && interactive && error) setRetry(value => value + 1);
    previousInteraction.current = interactive;
  }, [interactive, error]);
  const displayed = enabled && loaded && visible;
  return <div className={`model-view${interactive ? ' interactive' : ''}`} data-loaded={enabled && loaded} data-visible={displayed} data-model-state={state?.stateId} aria-busy={enabled && !loaded && !error}>
    <div className="model-fallback" aria-hidden={displayed}>{fallback}</div>
    <div className="model-host" ref={host} aria-hidden={!interactive || !displayed} inert={!interactive || !displayed}/>
    {interactive && displayed && <div className="model-controls">
      {state?.source && <>
        <button type="button" className="text-button" onClick={() => void handle.current?.reset()}>重置视角</button>
        {state.source.clips.length > 0 && <>
          <select aria-label="模型动画" value={state.source.selected} onChange={event => void handle.current?.act(event.target.value)}>
            <option value="" disabled>选择动画</option>
            {state.source.clips.map(clip => <option key={clip.id} value={clip.id}>{clip.label}</option>)}
          </select>
          {state.source.selected && <>
            <button type="button" className="text-button" onClick={() => void handle.current?.act('pause')}>{state.source.playing ? '暂停' : '播放'}</button>
            <button type="button" className="text-button" onClick={() => void handle.current?.act('stop')}>停止动画</button>
          </>}
        </>}
      </>}
      {state?.assembly?.actions.filter(action => ['decode', 'uncover'].includes(action.id) && !action.disabled).map(action => <button type="button" className="text-button" key={action.id} disabled={state.busy} onClick={() => void handle.current?.act(action.id).catch(() => {})}>{action.label}</button>)}
      {state?.returns.map(option => <button type="button" className="text-button" key={option.target} disabled={state.busy} onClick={() => void handle.current?.putBack(option.target).catch(() => {})}>{option.label}</button>)}
      {state?.held && <button type="button" className="text-button" disabled={state.busy} onClick={() => void handle.current?.exitInspection().catch(() => {})}>返回</button>}
      {(state?.step || state?.returns.length) ? <button type="button" className="text-button" disabled={state?.busy} onClick={() => void handle.current?.reset().catch(() => {})}>全部收起</button> : null}
    </div>}
    {interactive && error && <p className="model-error" role="alert">{error}</p>}
  </div>;
}
