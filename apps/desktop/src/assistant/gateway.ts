import { Channel, invoke } from '@tauri-apps/api/core';
import type { CopyDraft } from '../library/types';
export interface Proposal { title: string; before: CopyDraft; request: { requestId: string; id: string; expectedRevision: number; copy: CopyDraft } }
export interface ActionPreview { id: string; title: string; kind: 'add' | 'supplement' | 'cover'; changes: { label: string; before: string; after: string }[]; hasImages: boolean }
export interface AgentMessage { role: string; content: string | null; tool_calls?: { id: string; function: { name: string } }[]; tool_call_id?: string }
export interface AgentSession { id: string; phase: string; messages: AgentMessage[]; events: string[]; pending: Proposal | null; action: ActionPreview | null; undo: Proposal | null; error: string | null }
export interface HistoryEntry { id: string; title: string; updatedAt: string }
function channel(progress: (session: AgentSession) => void) {
  const onEvent = new Channel<AgentSession>(); onEvent.onmessage = progress;
  return onEvent;
}
export const assistant = {
  snapshot: () => invoke<AgentSession>('assistant_snapshot'),
  send: (text: string, copyId: string | null, progress: (session: AgentSession) => void) =>
    invoke<AgentSession>('assistant_send', { text, copyId, onEvent: channel(progress) }),
  retry: (progress: (session: AgentSession) => void) =>
    invoke<AgentSession>('assistant_retry', { onEvent: channel(progress) }),
  images: (proposalId: string) => invoke<{ before: string | null; after: string | null }>('assistant_preview_images', { proposalId }),
  cancel: () => invoke<void>('assistant_cancel'),
  newSession: () => invoke<AgentSession>('assistant_new'),
  history: (offset: number) => invoke<{ items: HistoryEntry[]; nextOffset: number | null }>('assistant_history', { offset }),
  resume: (id: string) => invoke<AgentSession>('assistant_resume', { id }),
  decide: (sessionId: string, proposalId: string, approve: boolean, undo = false) => invoke<AgentSession>('assistant_decide', { sessionId, proposalId, approve, undo }),
};
