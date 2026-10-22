import type { VideoFact, VideoWork } from './gateway';

export interface GalleryPicture { key:string; kind:string; url:string; previewUrl:string; label:string; sources:string[] }
const sourceName = (work:VideoWork) => work.source === 'bangumi' ? 'Bangumi' : 'TMDB';
export function galleryPictures(works:VideoWork[]):GalleryPicture[] {
  const pictures = new Map<string,GalleryPicture>();
  function add(work:VideoWork, picture:Omit<GalleryPicture,'key'|'sources'>) {
    const old = pictures.get(picture.url), source = sourceName(work);
    if (old) {if (!old.sources.includes(source)) old.sources.push(source);}
    else pictures.set(picture.url,{...picture,key:picture.url,sources:[source]});
  }
  for (const work of works) {
    for (const row of work.images || []) add(work,{kind:row.kind,url:row.url,previewUrl:row.previewUrl,label:`${row.kind === 'poster' ? '海报' : '剧照'} · ${row.width} × ${row.height}${row.language ? ` · ${row.language}` : ''}`});
    if (!work.images?.some(row => row.kind === 'poster') && work.posterUrl) add(work,{kind:'poster',url:work.posterUrl,previewUrl:work.posterUrl,label:'作品封面'});
    for (const row of work.chapters || []) if (row.imageUrl) add(work,{kind:'episode',url:row.imageUrl,previewUrl:row.imageUrl,label:`${row.group} · ${row.number} · ${row.originalTitle || row.title}`});
  }
  return [...pictures.values()];
}
export function mergedFacts(works:VideoWork[]):VideoFact[] {
  const facts = new Map<string,VideoFact>();
  for (const work of works) for (const fact of work.facts || []) {
    if (fact.label === '中文名') continue;
    const merged = facts.get(fact.label) || {label:fact.label,values:[]};
    for (const value of fact.values) if (!merged.values.some(v => v.text === value.text && v.url === value.url)) merged.values.push({...value});
    facts.set(fact.label,merged);
  }
  return [...facts.values()];
}
export function animationCharacters(works:VideoWork[]) {
  return works.filter(work => work.source === 'bangumi').flatMap(work => work.characters || []);
}
