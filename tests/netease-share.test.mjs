import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNeteaseShare } from '../apps/desktop/src/integrations/shareLink.ts';

test('the supplied album link format resolves only the ID, including pasted Markdown', () => {
  const url = 'https://music.163.com/album?id=153778832&uct2=share-marker';
  assert.deepEqual(parseNeteaseShare(url), { kind:'album', id:153778832 });
  assert.deepEqual(parseNeteaseShare(`[${url}](${url})`), { kind:'album', id:153778832 });
  assert.deepEqual(parseNeteaseShare(`分享专辑 ${url}`), { kind:'album', id:153778832 });
});
test('documented song query, fragment and path forms resolve a song reference', () => {
  for (const url of ['https://music.163.com/#/song?id=29178366', 'https://music.163.com/song?id=29178366', 'https://music.163.com/song/29178366']) {
    assert.deepEqual(parseNeteaseShare(url), {kind:'song',id:29178366});
  }
  assert.equal(parseNeteaseShare('Album Artist'), null);
});
test('foreign hosts, ambiguous identities and invalid IDs never become requests', () => {
  for (const value of ['https://music.163.com.evil.example/album?id=1','https://user:secret@music.163.com/album?id=1','https://music.163.com:8080/album?id=1','https://music.163.com/album?id=0','https://music.163.com/album?id=1&id=2','https://music.163.com/playlist?id=1','https://music.163.com/album?id=9007199254740992','https://music.163.com/album?id=1 https://music.163.com/album?id=2']) {
    assert.throws(() => parseNeteaseShare(value));
  }
});
