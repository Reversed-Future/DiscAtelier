import { createElement, Fragment, useMemo, type ReactNode } from 'react';
import { parseInline, parseMarkdown, type MarkdownInline } from './markdown';

function text(value: string): ReactNode {
  return value.split('\n').map((line, index) => <Fragment key={index}>{index > 0 && <br/>}{line}</Fragment>);
}

function inline(nodes: MarkdownInline[]): ReactNode {
  return nodes.map((node, index) => {
    switch (node.type) {
      case 'text': return <Fragment key={index}>{text(node.text)}</Fragment>;
      case 'code': return <code key={index}>{node.text}</code>;
      case 'strong': return <strong key={index}>{inline(node.children)}</strong>;
      case 'em': return <em key={index}>{inline(node.children)}</em>;
      case 'strike': return <del key={index}>{inline(node.children)}</del>;
      case 'link': return <a key={index} href={node.href} target="_blank" rel="noreferrer">{inline(node.children)}</a>;
    }
  });
}

export function Markdown({ text: source }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return <div className="assistant-markdown">
    {blocks.map((block, index) => {
      if (block.type === 'code') return <pre key={index}><code>{block.text}</code></pre>;
      if (block.type === 'heading') return createElement(`h${block.level}`, { key: index }, inline(parseInline(block.text)));
      if (block.type === 'list') return block.ordered
        ? <ol key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{inline(parseInline(item))}</li>)}</ol>
        : <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{inline(parseInline(item))}</li>)}</ul>;
      if (block.type === 'quote') return <blockquote key={index}>{inline(parseInline(block.text))}</blockquote>;
      if (block.type === 'rule') return <hr key={index}/>;
      return <p key={index}>{inline(parseInline(block.text))}</p>;
    })}
  </div>;
}
