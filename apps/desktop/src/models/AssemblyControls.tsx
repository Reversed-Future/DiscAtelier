import type { ModelHandle, ModelState } from '../../../../packages/atelier-model-runtime';

export function AssemblyControls({ state, handle }: { state: ModelState; handle: ModelHandle | null }) {
  const assembly = state.assembly;
  if (!assembly) return null;
  return <>
    {assembly.message && <p className="model-assembly-message" aria-live="polite">{assembly.message}</p>}
    <div className="model-assembly-row" aria-label="模型部件">
      {assembly.parts.map(part => <button type="button" className="text-button" key={part.id}
        aria-pressed={assembly.selected === part.id} disabled={state.busy}
        onClick={() => void handle?.selectPart(part.id).catch(() => {})}>{part.label}</button>)}
    </div>
    <div className="model-assembly-row" aria-label="部件操作">
      {assembly.actions.map(action => <button type="button" className="text-button" key={action.id}
        disabled={state.busy || action.disabled} onClick={() => void handle?.act(action.id).catch(() => {})}>{action.label}</button>)}
    </div>
  </>;
}
