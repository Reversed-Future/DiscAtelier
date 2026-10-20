import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { ModelChange } from './assets';

/** Own the prepared asset for the whole form, including AddCopy's purchase step. */
export function useModelDraft() {
  const [model, setModel] = useState<ModelChange>({ action: 'keep' });
  useEffect(() => () => {
    if (model.action === 'prepared') void invoke('model_release', { token: model.token }).catch(() => {});
  }, [model]);
  return [model, setModel] as const;
}
