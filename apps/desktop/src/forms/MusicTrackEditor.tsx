import { Select } from '../ui/Select';
import type { MediumDraft } from '../library/types';
import type { ReleaseTrack } from '../metadata/gateway';
import { discPages, type DiscEntry } from '../metadata/discTracks';
import { physicalDiscLabel } from '../metadata/physicalDiscs';
import { ContentEditorTable } from './ContentEditorTable';
import { assignTrackDisc, removeTrackRows, updateTrackRows } from './contentTracks';

export function MusicTrackEditor({ tracks, title, media, onChange }: {
  tracks: ReleaseTrack[]; title: string; media: MediumDraft[]; onChange(tracks: ReleaseTrack[], sameRows?: boolean): void;
}) {
  const edit = (rows: ReleaseTrack[]) => onChange(rows, true);
  const pages = discPages(tracks, title, media);
  const sections: { label: string; number: number | null; entries: DiscEntry[]; titleEntry?: DiscEntry }[] = media.map((medium, index) => ({
    label: physicalDiscLabel(medium, index), number: index + 1,
    entries: pages.filter(page => page.number === index + 1).flatMap(page => page.entries || []),
    titleEntry: pages.find(page => page.number === index + 1)?.titleEntry,
  }));
  const unassigned = pages.filter(page => page.number === undefined).flatMap(page => page.entries || []);
  if (unassigned.length || !sections.length) sections.push({ label: '未分盘', number: null, entries: unassigned });
  function add(section: typeof sections[number], type_: 'track' | 'heading') {
    const after = section.entries.length ? Math.max(...section.entries.map(entry => entry.path[0])) + 1 : tracks.length;
    const row: ReleaseTrack = { title: '', position: '', duration: '', type_, heading_kind: type_ === 'heading' ? 'section' : undefined, disc_number: section.number, sub_tracks: [], extraartists: [] };
    onChange([...tracks.slice(0, after), row, ...tracks.slice(after)]);
  }
  return <div className="music-track-editor">{sections.map(section => {
    const first = section.entries[0];
    const discTitle = section.titleEntry;
    const entries = section.entries.filter(entry => entry.source !== discTitle?.source);
    return <section className="content-editor-disc" key={section.number ?? 'unassigned'} aria-label={section.label}>
      <div className="content-editor-heading"><h3>{section.label}</h3><div className="content-editor-disc-actions">
        <button type="button" className="text-button" onClick={() => add(section, 'track')}>添加曲目</button>
        <button type="button" className="text-button" onClick={() => add(section, 'heading')}>添加小标题</button>
      </div></div>
      <label className="content-editor-disc-title"><span>分盘标题</span><input aria-label={`${section.label} 分盘标题`} value={discTitle?.source.title || ''} placeholder={title}
        onChange={event => {
          if (discTitle) edit(updateTrackRows(tracks, discTitle.path, { title: event.target.value }));
          else {
            const before = first?.path[0] ?? tracks.length;
            const heading: ReleaseTrack = { title: event.target.value, position: '', duration: '', type_: 'heading', heading_kind: 'disc', disc_number: section.number };
            onChange([...tracks.slice(0, before), heading, ...tracks.slice(before)]);
          }
        }}/></label>
      <ContentEditorTable kind="tracks"><thead><tr><th>所属 Disc</th><th>条目类型</th><th>原曲号</th><th>标题</th><th>时长</th><th/></tr></thead><tbody>
        {entries.map(({ source: row, path }) => {
          const group = !!row.sub_tracks?.length;
          const kind = row.type_ === 'heading' ? 'heading' : group ? 'index' : 'track';
          const label = path.join('.');
          return <tr key={label} data-entry-type={kind}>
            <td><Select label={`条目 ${label} 所属 Disc`} value={row.disc_number == null ? '' : String(row.disc_number)}
              options={[{ id: '', label: `自动${section.number ? ` · Disc ${section.number}` : ' · 未分盘'}` },
                ...media.map((medium, index) => ({ id: String(index + 1), label: physicalDiscLabel(medium, index) }))]}
              onChange={value => edit(assignTrackDisc(tracks, path, value ? Number(value) : null))}/></td>
            <td><Select label={`条目 ${label} 类型`} value={kind} disabled={group}
              options={[{ id: 'track', label: '曲目' }, { id: 'heading', label: '小标题' }, ...(group ? [{ id: 'index', label: '曲目组' }] : [])]}
              onChange={value => edit(updateTrackRows(tracks, path, { type_: value, heading_kind: value === 'heading' ? 'section' : undefined, disc_number: value === 'heading' ? section.number : row.disc_number }))}/></td>
            <td><input disabled={kind === 'heading'} aria-label={`条目 ${label} 原曲号`} value={row.position} onChange={event => edit(updateTrackRows(tracks, path, { position: event.target.value }))}/></td>
            <td><input aria-label={`条目 ${label} 标题`} style={{ paddingLeft: 10 + (path.length - 1) * 16 }} value={row.title} onChange={event => edit(updateTrackRows(tracks, path, { title: event.target.value }))}/></td>
            <td><input disabled={kind === 'heading'} aria-label={`条目 ${label} 时长`} value={row.duration} onChange={event => edit(updateTrackRows(tracks, path, { duration: event.target.value }))}/></td>
            <td><button type="button" className="text-button" onClick={() => onChange(removeTrackRows(tracks, path))}>移除</button></td>
          </tr>;
        })}
        {!entries.length && <tr className="content-editor-ghost"><td colSpan={6}><button type="button" className="content-editor-ghost-add" onClick={() => add(section, 'track')}>添加第一条曲目</button></td></tr>}
      </tbody></ContentEditorTable>
    </section>;
  })}</div>;
}
