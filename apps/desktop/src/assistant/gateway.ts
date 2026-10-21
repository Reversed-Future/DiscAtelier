import { Channel, invoke } from '@tauri-apps/api/core';
import type { CopyDraft } from '../library/types';
export interface Proposal { title: string; before: CopyDraft; request: { requestId: string; id: string; expectedRevision: number; copy: CopyDraft } }
export interface ActionPreview { id: string; title: string; kind: 'add' | 'supplement' | 'cover'; changes: { label: string; before: string; after: string }[]; hasImages: boolean }
export interface AgentSession { id: string; phase: string; messages: { role: string; content: string | null }[]; events: string[]; pending: Proposal | null; action: ActionPreview | null; undo: Proposal | null; error: string | null }
export const assistant = {
  snapshot: () => invoke<AgentSession>('assistant_snapshot'),
  send: (text: string, progress: (session: AgentSession) => void) => {
    const onEvent = new Channel<AgentSession>(); onEvent.onmessage = progress;
    return invoke<AgentSession>('assistant_send', { text, onEvent });
  },
  images: (proposalId: string) => invoke<{ before: string | null; after: string | null }>('assistant_preview_images', { proposalId }),
  cancel: () => invoke<void>('assistant_cancel'),
  newSession: () => invoke<AgentSession>('assistant_new'),
  decide: (sessionId: string, proposalId: string, approve: boolean, undo = false) => invoke<AgentSession>('assistant_decide', { sessionId, proposalId, approve, undo }),
};
