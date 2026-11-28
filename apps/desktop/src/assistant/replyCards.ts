import type { AgentMessage } from './gateway';

export interface CollectionCard {
  id: string;
  title: string;
  creator: string;
  editionLabel: string;
  status: string;
  coverAssetId: string | null;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function toCard(value: unknown): CollectionCard | null {
  const row = record(value), edition = record(row.edition);
  if (typeof row.id !== 'string' || typeof row.title !== 'string' || !row.title) return null;
  const label = row.editionLabel ?? edition.editionLabel;
  return { id: row.id, title: row.title, creator: typeof row.creator === 'string' ? row.creator : '',
    editionLabel: typeof label === 'string' ? label : '', status: typeof row.status === 'string' ? row.status : '',
    coverAssetId: typeof row.coverAssetId === 'string' ? row.coverAssetId : null };
}

/** Only the result of a completed library tool can attach artwork to its reply. */
export function cardsByReply(messages: AgentMessage[]) {
  const replies = new Map<AgentMessage, CollectionCard[]>();
  const calls = new Map<string, string>(), lookedUp = new Map<string, CollectionCard>();
  let selected: CollectionCard[] = [];
  for (const message of messages) {
    if (message.role === 'user') {
      calls.clear(); lookedUp.clear(); selected = [];
    } else if (message.role === 'assistant') {
      if (message.tool_calls?.length) {
        for (const call of message.tool_calls) calls.set(call.id, call.function.name);
      } else if (message.content) {
        const cards = selected.length ? selected : [...lookedUp.values()].slice(0,4);
        if (cards.length) replies.set(message, cards);
        calls.clear(); lookedUp.clear(); selected = [];
      }
    } else if (message.role === 'tool' && message.tool_call_id && message.content) {
      const name = calls.get(message.tool_call_id);
      if (name !== 'get_copy' && name !== 'show_collection_cards') continue;
      let result: Record<string, unknown>;
      try { result = record(JSON.parse(message.content)); } catch { continue; }
      if (name === 'show_collection_cards' && Array.isArray(result.cards)) {
        selected = result.cards.slice(0,4).map(toCard).filter((c): c is CollectionCard => c !== null);
      } else if (name === 'get_copy') {
        const card = toCard(result.copy);
        if (card) lookedUp.set(card.id, card);
      }
    }
  }
  return replies;
}
