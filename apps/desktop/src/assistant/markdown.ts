export type MarkdownBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'code'; language: string; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'rule' };

export type MarkdownInline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong'; children: MarkdownInline[] }
  | { type: 'em'; children: MarkdownInline[] }
  | { type: 'strike'; children: MarkdownInline[] }
  | { type: 'link'; href: string; children: MarkdownInline[] };

const FENCE = /^\s*```(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;

function listItem(line: string): { ordered: boolean; text: string } | null {
  const unordered = line.match(/^\s*[-*+]\s+(.*)$/);
  if (unordered) return { ordered: false, text: unordered[1] };
  const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
  return ordered ? { ordered: true, text: ordered[1] } : null;
}

function startsBlock(line: string): boolean {
  return FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || !!listItem(line);
}

/** A deliberately small Markdown parser; every node is rendered as text/elements, never raw HTML. */
export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const fence = line.match(FENCE);
    if (fence) {
      const language = fence[1].trim().slice(0, 32);
      index += 1;
      const code: string[] = [];
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push({ type: 'code', language, text: code.join('\n') });
      continue;
    }
    const heading = line.match(HEADING);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      index += 1;
      continue;
    }
    if (RULE.test(line)) { blocks.push({ type: 'rule' }); index += 1; continue; }
    if (QUOTE.test(line)) {
      const quote: string[] = [];
      while (index < lines.length) {
        const match = lines[index].match(QUOTE);
        if (!match) break;
        quote.push(match[1]);
        index += 1;
      }
      blocks.push({ type: 'quote', text: quote.join('\n') });
      continue;
    }
    const item = listItem(line);
    if (item) {
      const items: string[] = [];
      while (index < lines.length) {
        const next = listItem(lines[index]);
        if (!next || next.ordered !== item.ordered) break;
        items.push(next.text);
        index += 1;
      }
      blocks.push({ type: 'list', ordered: item.ordered, items });
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !startsBlock(lines[index])) paragraph.push(lines[index++]);
    blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
  }
  return blocks;
}

const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_|\[[^\]\n]+\]\([^)\s]+\))/g;

export function parseInline(source: string): MarkdownInline[] {
  const nodes: MarkdownInline[] = [];
  let last = 0;
  for (const match of source.matchAll(INLINE)) {
    const start = match.index ?? 0;
    if (start > last) nodes.push({ type: 'text', text: source.slice(last, start) });
    const token = match[0];
    if (token.startsWith('`')) {
      nodes.push({ type: 'code', text: token.slice(1, -1) });
    } else if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push({ type: 'strong', children: parseInline(token.slice(2, -2)) });
    } else if (token.startsWith('~~')) {
      nodes.push({ type: 'strike', children: parseInline(token.slice(2, -2)) });
    } else if (token.startsWith('*') || token.startsWith('_')) {
      nodes.push({ type: 'em', children: parseInline(token.slice(1, -1)) });
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      if (link && /^https?:\/\//i.test(link[2])) {
        nodes.push({ type: 'link', href: link[2], children: parseInline(link[1]) });
      } else {
        nodes.push({ type: 'text', text: token });
      }
    }
    last = start + token.length;
  }
  if (last < source.length) nodes.push({ type: 'text', text: source.slice(last) });
  return nodes;
}
