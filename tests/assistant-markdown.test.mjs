import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInline, parseMarkdown } from '../apps/desktop/src/assistant/markdown.ts';

test('parses headings, lists, quotes and fenced code without HTML injection', () => {
  const blocks = parseMarkdown('## 标题\n\n- 一\n- 二\n\n> 引用\n\n```ts\nconst x = 1;\n```\n\n<script>alert(1)</script>');
  assert.deepEqual(blocks[0], { type: 'heading', level: 2, text: '标题' });
  assert.deepEqual(blocks[1], { type: 'list', ordered: false, items: ['一', '二'] });
  assert.deepEqual(blocks[2], { type: 'quote', text: '引用' });
  assert.deepEqual(blocks[3], { type: 'code', language: 'ts', text: 'const x = 1;' });
  assert.deepEqual(blocks[4], { type: 'paragraph', text: '<script>alert(1)</script>' });
});

test('parses inline emphasis, code, strikethrough and safe links', () => {
  const inline = parseInline('**粗体** *斜体* `code` ~~删除~~ [site](https://example.com) [bad](javascript:alert(1))');
  assert.equal(inline[0].type, 'strong');
  assert.equal(inline[0].children[0].text, '粗体');
  assert.equal(inline[1].type, 'text');
  assert.equal(inline[2].type, 'em');
  assert.equal(inline[4].type, 'code');
  assert.equal(inline[6].type, 'strike');
  assert.equal(inline[8].type, 'link');
  assert.equal(inline[8].href, 'https://example.com');
  assert.equal(inline[10].type, 'text');
  assert.match(inline[10].text, /javascript:alert/);
});
