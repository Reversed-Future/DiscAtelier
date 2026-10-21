import { useEffect, useState } from 'react';
import { errorMessage } from '../library/gateway';
import { assistant, type ActionPreview } from './gateway';

export function ActionConfirmation({ action, busy, decide }: { action: ActionPreview; busy: boolean; decide(approve: boolean): void }) {
  const [images, setImages] = useState<{ before: string | null; after: string | null } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true; setImages(null); setError('');
    if (action.hasImages) void assistant.images(action.id).then(value => { if (active) setImages(value); }).catch(cause => { if (active) setError(errorMessage(cause)); });
    return () => { active = false; };
  }, [action.id, action.hasImages]);
  return <section className="assistant-action" aria-label="待确认的收藏变更">
    <strong>{action.title}</strong><p className="setting-hint">确认后才保存</p>
    <div className="assistant-change-scroll" data-long-scroll>
      {action.hasImages && <div className="assistant-cover-diff">
        {(['before', 'after'] as const).map(key => <figure key={key}><figcaption>{key === 'before' ? '原封面' : '新封面'}</figcaption>{images?.[key] ? <img src={images[key]!} alt={key === 'before' ? '原封面' : '新封面'}/> : <span>{images ? '无封面' : '读取中'}</span>}</figure>)}
      </div>}
      {action.changes.map((field, index) => <div className="assistant-change" key={index}>
        <span>{field.label}</span><div><small>之前</small><p>{field.before || '未填写'}</p><small>之后</small><p>{field.after || '未填写'}</p></div>
      </div>)}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="assistant-action-buttons"><button className="text-button" disabled={busy} onClick={() => decide(false)}>取消</button><button className="solid-button" disabled={busy || (action.hasImages && !images)} onClick={() => decide(true)}>确认保存</button></div>
  </section>;
}
