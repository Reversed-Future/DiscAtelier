import { useEffect, useRef, useState } from 'react';
import type { EditionContent, ReleaseCompany, ReleaseCredit, ReleaseTrack } from '../metadata/gateway';
import { library, errorMessage } from '../library/gateway';
import type { LibraryCopy } from '../library/types';
import { readCover } from '../library/artwork';
import { video, emptyVideo, type VideoCharacter, type VideoChapter, type VideoFact, type VideoMetadata, type VideoWork } from '../video/gateway';
import { videoWorks } from '../video/sources';
import { TrackMultiSelect } from './TrackMultiSelect';
import { ContentEditorTable } from './ContentEditorTable';
import { removeTrackRows } from './contentTracks';

function splitTags(value: string) {
  return value.split(',').map(part => part.trim()).filter(Boolean);
}

interface FlatTrack {
  track: ReleaseTrack;
  path: number[];
  depth: number;
}

function flattenTrackRows(rows: ReleaseTrack[], prefix: number[] = [], depth = 0): FlatTrack[] {
  return rows.flatMap((track, index) => {
    const path = [...prefix, index];
    return [
      { track, path, depth },
      ...flattenTrackRows(track.sub_tracks || [], path, depth + 1),
    ];
  });
}

function updateTrackRows(rows: ReleaseTrack[], path: number[], patch: Partial<ReleaseTrack>): ReleaseTrack[] {
  const [index, ...rest] = path;
  return rows.map((row, at) => at !== index ? row
    : rest.length ? { ...row, sub_tracks: updateTrackRows(row.sub_tracks || [], rest, patch) }
    : { ...row, ...patch });
}

function trackDisc(position: string) {
  return Number(position.match(/^(?:CD|DVD)?(\d+)-/i)?.[1] || 1);
}

function withDisc(position: string, disc: number, fallback: number) {
  const suffix = position.match(/-(\d+(?:\.\d+)?)$/)?.[1] || String(fallback);
  return `${disc}-${suffix}`;
}

function MusicEditor({ item, onSaved, onBusy }: { item: LibraryCopy; onSaved(): void; onBusy(value: boolean): void }) {
  const [content, setContent] = useState<EditionContent | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    library.content(item.editionId).then(value => {
      if (!live) return;
      setContent(value || { genres: [], styles: [], tracks: [], credits: [], companies: [], notes: '', detailsLoaded: false });
    }).catch(cause => { if (live) setError(errorMessage(cause)); }).finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [item.editionId]);
  if (busy || !content) return <p className="utility-copy">{error || '正在读取资料…'}</p>;
  const change = (value: Partial<EditionContent>) => setContent(current => current ? { ...current, ...value } : current);
  const flatTracks = flattenTrackRows(content.tracks);
  const leaves = flatTracks.filter(entry => entry.track.type_ !== 'heading');
  const updateTrack = (path: number[], value: Partial<ReleaseTrack>) => change({ tracks: updateTrackRows(content.tracks, path, value) });
  const removeTrack = (path: number[]) => change({ tracks: removeTrackRows(content.tracks, path) });
  const credit = (index: number, value: Partial<ReleaseCredit>) => change({ credits: content.credits.map((row, i) => i === index ? { ...row, ...value } : row) });
  const company = (index: number, value: Partial<ReleaseCompany>) => change({ companies: content.companies.map((row, i) => i === index ? { ...row, ...value } : row) });
  const trackLabel = (path: number[], position: string, title: string) => `${path.join('.')} · ${position || '—'} · ${title || '未命名'}`;
  return <section className="content-editor">
    <p className="setting-hint">这里编辑的是已保存的曲目、 Credits 和专辑资料。保存后会同时用于本地关联、搜索和详情显示。</p>
    <div className="content-editor-scroll">
      <label>流派<input value={content.genres.join(', ')} onChange={e => change({ genres: splitTags(e.target.value) })}/></label>
      <label>风格<input value={content.styles.join(', ')} onChange={e => change({ styles: splitTags(e.target.value) })}/></label>
      <label>简介<textarea rows={4} value={content.notes} onChange={e => change({ notes: e.target.value })}/></label>
      <div className="content-editor-heading"><h3>曲目</h3><button type="button" className="text-button" onClick={() => change({ tracks: [...content.tracks, { position: '1-1', title: '', duration: '', type_: 'track', sub_tracks: [], extraartists: [] }] })}>添加曲目</button></div>
      <ContentEditorTable kind="tracks"><thead><tr><th>Disc</th><th>位置</th><th>标题</th><th>时长</th><th/></tr></thead><tbody>
        {flatTracks.map(({ track: row, path, depth }) => <tr key={path.join('.')}>
          <td><input type="number" min="1" max="99" aria-label={`曲目 ${path.join('.')} Disc`} value={trackDisc(row.position)} onChange={e => updateTrack(path, { position: withDisc(row.position, Number(e.target.value) || 1, path.at(-1)! + 1) })}/></td>
          <td><input value={row.position} aria-label={`曲目 ${path.join('.')} 位置`} onChange={e => updateTrack(path, { position: e.target.value })}/></td>
          <td><input style={{ paddingLeft: 10 + depth * 16 }} value={row.title} aria-label={`曲目 ${path.join('.')} 标题`} onChange={e => updateTrack(path, { title: e.target.value })}/></td>
          <td><input value={row.duration} aria-label={`曲目 ${path.join('.')} 时长`} onChange={e => updateTrack(path, { duration: e.target.value })}/></td>
          <td><button type="button" className="text-button" onClick={() => removeTrack(path)}>移除</button></td>
        </tr>)}
        {!flatTracks.length && <tr className="content-editor-ghost">
          <td><span className="content-editor-ghost-cell"/></td><td><span className="content-editor-ghost-cell"/></td>
          <td><span className="content-editor-ghost-cell"/></td><td><span className="content-editor-ghost-cell"/></td>
          <td><button type="button" className="content-editor-ghost-add" onClick={() => change({ tracks: [{ position: '1-1', title: '', duration: '', type_: 'track', sub_tracks: [], extraartists: [] }] })}>添加曲目</button></td>
        </tr>}
      </tbody></ContentEditorTable>
      <div className="content-editor-heading"><h3>Credits</h3><button type="button" className="text-button" onClick={() => change({ credits: [...content.credits, { name: '', anv: '', role: '', tracks: '' }] })}>添加</button></div>
      <ContentEditorTable kind="credits"><thead><tr><th>姓名</th><th>别名（ANV）</th><th>角色</th><th>曲目</th><th/></tr></thead><tbody>
        {content.credits.map((row, i) => <tr key={i}><td><input value={row.name} onChange={e => credit(i, { name: e.target.value })}/></td><td><input value={row.anv} placeholder="没有别名就留空" onChange={e => credit(i, { anv: e.target.value })}/></td><td><input value={row.role} onChange={e => credit(i, { role: e.target.value })}/></td><td><TrackMultiSelect value={row.tracks} options={leaves.map(entry => ({ id: entry.track.position, label: trackLabel(entry.path, entry.track.position, entry.track.title) }))} onChange={value => credit(i, { tracks: value })}/></td><td><button type="button" className="text-button" onClick={() => change({ credits: content.credits.filter((_, at) => at !== i) })}>移除</button></td></tr>)}
        {!content.credits.length && <tr className="content-editor-ghost">
          <td><span className="content-editor-ghost-cell"/></td><td><span className="content-editor-ghost-cell"/></td>
          <td><span className="content-editor-ghost-cell"/></td><td><span className="content-editor-ghost-cell"/></td>
          <td><button type="button" className="content-editor-ghost-add" onClick={() => change({ credits: [{ name: '', anv: '', role: '', tracks: '' }] })}>添加 Credits</button></td>
        </tr>}
      </tbody></ContentEditorTable>
      <div className="content-editor-heading"><h3>公司</h3><button type="button" className="text-button" onClick={() => change({ companies: [...content.companies, { name: '', entity_type_name: '', catno: '' }] })}>添加</button></div>
      <ContentEditorTable kind="companies"><thead><tr><th>名称</th><th>类型</th><th>品番</th><th/></tr></thead><tbody>
        {content.companies.map((row, i) => <tr key={i}><td><input value={row.name} onChange={e => company(i, { name: e.target.value })}/></td><td><input value={row.entity_type_name} onChange={e => company(i, { entity_type_name: e.target.value })}/></td><td><input value={row.catno} onChange={e => company(i, { catno: e.target.value })}/></td><td><button type="button" className="text-button" onClick={() => change({ companies: content.companies.filter((_, at) => at !== i) })}>移除</button></td></tr>)}
        {!content.companies.length && <tr className="content-editor-ghost">
          <td><span className="content-editor-ghost-cell"/></td><td><span className="content-editor-ghost-cell"/></td>
          <td><span className="content-editor-ghost-cell"/></td>
          <td><button type="button" className="content-editor-ghost-add" onClick={() => change({ companies: [{ name: '', entity_type_name: '', catno: '' }] })}>添加公司</button></td>
        </tr>}
      </tbody></ContentEditorTable>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <footer className="settings-actions"><button type="button" className="solid-button" disabled={busy} onClick={async () => {
      setBusy(true); onBusy(true); setError('');
      try { await library.saveContent(item.editionId, content); onSaved(); }
      catch (cause) { setError(errorMessage(cause)); }
      finally { setBusy(false); onBusy(false); }
    }}>保存资料</button></footer>
  </section>;
}

function VideoEditor({ item, onSaved, onBusy }: { item: LibraryCopy; onSaved(): void; onBusy(value: boolean): void }) {
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const avatarInput = useRef<HTMLInputElement>(null);
  const [avatarRow, setAvatarRow] = useState(-1);
  useEffect(() => {
    let live = true;
    video.metadata(item.editionId).then(value => { if (live) setMetadata(value || emptyVideo()); })
      .catch(cause => { if (live) setError(errorMessage(cause)); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [item.editionId]);
  if (busy || !metadata) return <p className="utility-copy">{error || '正在读取资料…'}</p>;
  const works = videoWorks(metadata);
  const work = works[selected] || works[0];
  if (!work) return <p className="utility-copy">这份收藏还没有作品资料。</p>;
  const updateWork = (patch: Partial<VideoWork>) => {
    const next = works.map((row, index) => index === selected ? { ...row, ...patch } : row);
    setMetadata({ ...metadata, work: next[0] || null, additionalWorks: next.slice(1) });
  };
  const characters = work.characters || [];
  const chapters = work.chapters || [];
  const people = work.people || [];
  const facts = work.facts || [];
  const images = work.images || [];
  const character = (index: number, value: Partial<VideoCharacter>) => updateWork({ characters: characters.map((row, i) => i === index ? { ...row, ...value } : row) });
  const factText = (fact: VideoFact) => fact.values.map(value => value.url ? `${value.text} | ${value.url}` : value.text).join('\n');
  const parseFactValues = (text: string): VideoFact['values'] => text.split('\n').map(line => {
    const [textValue, url = ''] = line.split('|').map(part => part.trim());
    return { text: textValue, url };
  }).filter(value => value.text);
  const characterFactText = (row: VideoCharacter) => (row.facts || []).map(fact => `${fact.label}: ${factText(fact)}`).join('\n');
  const parseFacts = (text: string): VideoFact[] => text.split('\n').map(line => {
    const [label, ...values] = line.split(':');
    return { label: label.trim(), values: values.join(':').split('|').map(value => {
      const [text, url = ''] = value.split('|').map(part => part.trim());
      return { text, url };
    }).filter(value => value.text) };
  }).filter(fact => fact.label || fact.values.length);
  const chapter = (index: number, value: Partial<VideoChapter>) => updateWork({ chapters: chapters.map((row, i) => i === index ? { ...row, ...value } : row) });
  return <section className="content-editor">
    <p className="setting-hint">编辑已保存的作品、人物、角色和章节。角色头像可以填网络地址，也可以从本地选择图片；本地头像只保存在这份收藏资料里。</p>
    <div className="content-editor-scroll">
      {works.length > 1 && <label>编辑作品<select value={selected} onChange={e => setSelected(Number(e.target.value))}>{works.map((row, i) => <option key={`${row.source}:${row.externalId}`} value={i}>{row.title}</option>)}</select></label>}
      <label>标题<input value={work.title} onChange={e => updateWork({ title: e.target.value })}/></label>
      <label>原名<input value={work.originalTitle} onChange={e => updateWork({ originalTitle: e.target.value })}/></label>
      <label>简介<textarea rows={4} value={work.summary} onChange={e => updateWork({ summary: e.target.value })}/></label>
      <div className="form-row"><label>首播日期<input value={work.premiereDate} onChange={e => updateWork({ premiereDate: e.target.value })}/></label><label>集数<input type="number" min="1" max="9999" value={work.episodeCount ?? ''} onChange={e => updateWork({ episodeCount: e.target.value ? Number(e.target.value) : null })}/></label></div>
      <label>海报地址<input value={work.posterUrl} onChange={e => updateWork({ posterUrl: e.target.value })}/></label>
      <label>类型<input value={work.genres.join(', ')} onChange={e => updateWork({ genres: splitTags(e.target.value) })}/></label>

      <div className="content-editor-heading"><h3>资料条目</h3><button type="button" className="text-button" onClick={() => updateWork({ facts: [...facts, { label: '', values: [] }] })}>添加条目</button></div>
      <ContentEditorTable kind="facts"><thead><tr><th>标签</th><th>内容（每行 文本 | 链接）</th><th/></tr></thead><tbody>
        {facts.map((row, i) => <tr key={i}><td><input value={row.label} onChange={e => updateWork({ facts: facts.map((f, at) => at === i ? { ...f, label: e.target.value } : f) })}/></td><td><textarea rows={2} value={factText(row)} onChange={e => updateWork({ facts: facts.map((f, at) => at === i ? { ...f, values: parseFactValues(e.target.value) } : f) })}/></td><td><button type="button" className="text-button" onClick={() => updateWork({ facts: facts.filter((_, at) => at !== i) })}>移除</button></td></tr>)}
        {!facts.length && <tr className="content-editor-ghost"><td><span className="content-editor-ghost-cell"/></td><td><span className="content-editor-ghost-cell"/></td><td><button type="button" className="content-editor-ghost-add" onClick={() => updateWork({ facts: [{ label: '', values: [] }] })}>添加资料</button></td></tr>}
      </tbody></ContentEditorTable>

      <div className="content-editor-heading"><h3>图片</h3><button type="button" className="text-button" onClick={() => updateWork({ images: [...images, { kind: 'backdrop', url: '', previewUrl: '', width: 1, height: 1, language: '' }] })}>添加</button></div>
      <ContentEditorTable kind="images"><thead><tr><th>类型</th><th>地址</th><th>预览地址</th><th>语言</th><th>宽</th><th>高</th><th/></tr></thead><tbody>
        {images.map((row, i) => <tr key={i}><td><select value={row.kind} onChange={e => updateWork({ images: images.map((image, at) => at === i ? { ...image, kind: e.target.value as 'poster' | 'backdrop' } : image) })}><option value="poster">poster</option><option value="backdrop">backdrop</option></select></td><td><input value={row.url} onChange={e => updateWork({ images: images.map((image, at) => at === i ? { ...image, url: e.target.value } : image) })}/></td><td><input value={row.previewUrl} onChange={e => updateWork({ images: images.map((image, at) => at === i ? { ...image, previewUrl: e.target.value } : image) })}/></td><td><input value={row.language} onChange={e => updateWork({ images: images.map((image, at) => at === i ? { ...image, language: e.target.value } : image) })}/></td><td><input type="number" min="1" value={row.width} onChange={e => updateWork({ images: images.map((image, at) => at === i ? { ...image, width: Number(e.target.value) } : image) })}/></td><td><input type="number" min="1" value={row.height} onChange={e => updateWork({ images: images.map((image, at) => at === i ? { ...image, height: Number(e.target.value) } : image) })}/></td><td><button type="button" className="text-button" onClick={() => updateWork({ images: images.filter((_, at) => at !== i) })}>移除</button></td></tr>)}
        {!images.length && <tr className="content-editor-ghost">
          <td><span className="content-editor-ghost-cell"/></td><td><span className="content-editor-ghost-cell"/></td>
          <td><span className="content-editor-ghost-cell"/></td><td><span className="content-editor-ghost-cell"/></td>
          <td><span className="content-editor-ghost-cell"/></td><td><span className="content-editor-ghost-cell"/></td>
          <td><button type="button" className="content-editor-ghost-add" onClick={() => updateWork({ images: [{ kind: 'backdrop', url: '', previewUrl: '', width: 1, height: 1, language: '' }] })}>添加图片</button></td>
        </tr>}
      </tbody></ContentEditorTable>

      <div className="content-editor-heading"><h3>人物</h3><button type="button" className="text-button" onClick={() => updateWork({ people: [...people, { name: '', role: '' }] })}>添加</button></div>
      <ContentEditorTable kind="people"><thead><tr><th>姓名</th><th>角色</th><th/></tr></thead><tbody>
        {people.map((row, i) => <tr key={i}><td><input value={row.name} onChange={e => updateWork({ people: people.map((p, at) => at === i ? { ...p, name: e.target.value } : p) })}/></td><td><input value={row.role} onChange={e => updateWork({ people: people.map((p, at) => at === i ? { ...p, role: e.target.value } : p) })}/></td><td><button type="button" className="text-button" onClick={() => updateWork({ people: people.filter((_, at) => at !== i) })}>移除</button></td></tr>)}
        {!people.length && <tr className="content-editor-ghost"><td><span className="content-editor-ghost-cell"/></td><td><span className="content-editor-ghost-cell"/></td><td><button type="button" className="content-editor-ghost-add" onClick={() => updateWork({ people: [{ name: '', role: '' }] })}>添加人物</button></td></tr>}
      </tbody></ContentEditorTable>

      <div className="content-editor-heading"><h3>角色</h3><button type="button" className="text-button" onClick={() => updateWork({ characters: [...characters, { name: '', role: '', actors: [], portraitUrl: '', avatar: '' }] })}>添加角色</button></div>
      <div className="content-editor-characters">{characters.map((row, i) => <div className="content-editor-character" key={i}>
        <div className="content-editor-avatar">
          {row.avatar?.startsWith('data:image/') ? <img src={row.avatar} alt={row.name}/> : <span>无头像</span>}
          <button type="button" className="text-button" onClick={() => { setAvatarRow(i); avatarInput.current?.click(); }}>选择图片</button>
          {row.avatar && <button type="button" className="text-button" onClick={() => character(i, { avatar: '' })}>移除图片</button>}
        </div>
        <div className="content-editor-character-fields">
          <div className="form-row"><label>姓名<input value={row.name} onChange={e => character(i, { name: e.target.value })}/></label><label>角色<input value={row.role} onChange={e => character(i, { role: e.target.value })}/></label></div>
          <label>声优<input value={row.actors.join(', ')} onChange={e => character(i, { actors: splitTags(e.target.value) })}/></label>
          <label>角色资料<textarea rows={2} value={characterFactText(row)} onChange={e => character(i, { facts: parseFacts(e.target.value) })} placeholder="每行：标签: 内容"/></label>
          <label>头像地址<input value={row.portraitUrl || ''} onChange={e => character(i, { portraitUrl: e.target.value })} placeholder="https://…；也可以使用本地图片"/></label>
        </div>
        <button type="button" className="text-button" onClick={() => updateWork({ characters: characters.filter((_, at) => at !== i) })}>移除</button>
      </div>)}
      {!characters.length && <button type="button" className="content-editor-ghost-add" onClick={() => updateWork({ characters: [{ name: '', role: '', actors: [], portraitUrl: '', avatar: '' }] })}>添加第一个角色</button>}
      </div>
      <input ref={avatarInput} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label="角色头像文件" onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (!file || avatarRow < 0) return;
        try {
          const url = await readCover(file);
          if (url.length > 700_000) throw Error('头像图片过大，请使用较小的 PNG／JPEG／WebP。');
          character(avatarRow, { avatar: url });
          setError('');
        } catch (cause) { setError(errorMessage(cause)); }
      }}/>

      <div className="content-editor-heading"><h3>章节</h3><button type="button" className="text-button" onClick={() => updateWork({ chapters: [...chapters, { id: Date.now(), group: '', number: String(chapters.length + 1), title: '', originalTitle: '', airDate: '', duration: '', summary: '', imageUrl: '' }] })}>添加章节</button></div>
      <ContentEditorTable kind="chapters"><thead><tr><th>组</th><th>编号</th><th>标题</th><th>原名</th><th>日期</th><th>时长</th><th>简介</th><th/></tr></thead><tbody>
        {chapters.map((row, i) => <tr key={`${row.id}:${i}`}><td><input value={row.group} onChange={e => chapter(i, { group: e.target.value })}/></td><td><input value={row.number} onChange={e => chapter(i, { number: e.target.value })}/></td><td><input value={row.title} onChange={e => chapter(i, { title: e.target.value })}/></td><td><input value={row.originalTitle} onChange={e => chapter(i, { originalTitle: e.target.value })}/></td><td><input value={row.airDate} onChange={e => chapter(i, { airDate: e.target.value })}/></td><td><input value={row.duration} onChange={e => chapter(i, { duration: e.target.value })}/></td><td><input value={row.summary || ''} onChange={e => chapter(i, { summary: e.target.value })}/></td><td><button type="button" className="text-button" onClick={() => updateWork({ chapters: chapters.filter((_, at) => at !== i) })}>移除</button></td></tr>)}
        {!chapters.length && <tr className="content-editor-ghost">
          <td><span className="content-editor-ghost-cell"/></td><td><span className="content-editor-ghost-cell"/></td>
          <td><span className="content-editor-ghost-cell"/></td><td><span className="content-editor-ghost-cell"/></td>
          <td><span className="content-editor-ghost-cell"/></td><td><span className="content-editor-ghost-cell"/></td>
          <td><span className="content-editor-ghost-cell"/></td>
          <td><button type="button" className="content-editor-ghost-add" onClick={() => updateWork({ chapters: [{ id: Date.now(), group: '', number: '1', title: '', originalTitle: '', airDate: '', duration: '', summary: '', imageUrl: '' }] })}>添加章节</button></td>
        </tr>}
      </tbody></ContentEditorTable>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <footer className="settings-actions"><button type="button" className="solid-button" disabled={busy} onClick={async () => {
      setBusy(true); onBusy(true); setError('');
      try {
        await video.update({ requestId: crypto.randomUUID(), editionId: item.editionId, expectedRevision: item.editionRevision, edition: item.edition, cover: { action: 'keep' }, model: { action: 'keep' } }, metadata);
        onSaved();
      } catch (cause) { setError(errorMessage(cause)); }
      finally { setBusy(false); onBusy(false); }
    }}>保存资料</button></footer>
  </section>;
}

export function ContentEditor({ item, onSaved, onBusy }: { item: LibraryCopy; onSaved(): void; onBusy(value: boolean): void }) {
  return item.edition.categoryId === 'video'
    ? <VideoEditor item={item} onSaved={onSaved} onBusy={onBusy}/>
    : <MusicEditor item={item} onSaved={onSaved} onBusy={onBusy}/>;
}
