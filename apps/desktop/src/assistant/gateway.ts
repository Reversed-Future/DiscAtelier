import { invoke } from '@tauri-apps/api/core';
import type { CopyDraft } from '../library/types';
export interface Proposal { title: string; before: CopyDraft; request: { requestId: string; id: string; expectedRevision: number; copy: CopyDraft } }
export interface AgentSession { id: string; phase: string; messages: { role: string; content: string | null }[]; events: string[]; pending: Proposal | null; undo: Proposal | null; error: string | null }
export const assistant = {
  snapshot: () => invoke<AgentSession>('assistant_snapshot'),
  send: (text: string) => invoke<AgentSession>('assistant_send', { text }),
  cancel: () => invoke<void>('assistant_cancel'),
  newSession: () => invoke<AgentSession>('assistant_new'),
  decide: (sessionId: string, proposalId: string, approve: boolean, undo = false) => invoke<AgentSession>('assistant_decide', { sessionId, proposalId, approve, undo }),
};
