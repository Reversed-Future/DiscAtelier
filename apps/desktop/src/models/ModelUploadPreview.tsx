import type { ModelChange } from './assets';
import { ModelView } from './ModelView';
import { useModelDrop } from './useModelDrop';

/** The form owns the asset/token; this view only owns its visible renderer. */
export function ModelUploadPreview({ value, assetId, disabled, onChoose, onDrop, onError }: {
  value: ModelChange; assetId?: string | null; disabled: boolean;
  onChoose(): void; onDrop(paths: string[]): void; onError(cause: unknown): void;
}) {
  const { region, hovered } = useModelDrop(disabled, onDrop, onError);
  const source = value.action === 'prepared' ? { preparedToken: value.token }
    : value.action === 'keep' && assetId ? { assetId } : null;
  return <div ref={region} className="model-upload-preview" data-drag-over={hovered} aria-label="模型预览" aria-busy={disabled}>
    {source ? <ModelView {...source} interactive fallback={<p className="model-preview-loading" role="status">正在加载模型预览…</p>}/>
      : <button type="button" className="model-preview-empty" disabled={disabled} onClick={onChoose}>
        {disabled ? '正在读取模型…' : '点击上传或拖入模型，支持 .ateliermodel、GLB、OBJ、FBX、SKP'}
      </button>}
    {hovered && <div className="model-drop-overlay">松开鼠标上传模型</div>}
  </div>;
}
