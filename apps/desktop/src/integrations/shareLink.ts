export type NeteaseReference = { kind: 'album' | 'song'; id: number };

/** Verified forms: user's /album?id= share URL and upstream documented song URLs. */
export function parseNeteaseShare(text: string): NeteaseReference | null {
  const urls = text.match(/https?:\/\/[^\s<>\[\]()，。]+/g);
  if (!urls) {
    if (text.includes('://')) throw new Error('请输入网易云专辑或歌曲分享链接。');
    return null;
  }
  const references = urls.map(value => {
    const url = new URL(value);
    if (url.hostname !== 'music.163.com' || url.username || url.password || url.port) throw new Error('目前支持 music.163.com 的专辑、歌曲链接。');
    const route = url.pathname === '/' && url.hash.startsWith('#/') ? new URL(url.hash.slice(1), url.origin) : url;
    const songPath = /^\/song\/([1-9]\d*)$/.exec(route.pathname);
    const kind = route.pathname === '/album' ? 'album' : route.pathname === '/song' || songPath ? 'song' : null;
    const ids = songPath ? [songPath[1]] : route.searchParams.getAll('id');
    if (!kind || ids.length !== 1 || !/^[1-9]\d*$/.test(ids[0]) || !Number.isSafeInteger(Number(ids[0]))) throw new Error('链接中没有有效的专辑或歌曲 ID。');
    return { kind, id: Number(ids[0]) } as NeteaseReference;
  });
  const first = references[0];
  if (references.some(r => r.kind !== first.kind || r.id !== first.id)) throw new Error('请一次粘贴一张专辑或一首歌曲的链接。');
  return first;
}
