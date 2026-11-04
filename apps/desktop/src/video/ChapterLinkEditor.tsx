import { Select } from '../ui/Select';
import type { VideoChapterLink, VideoWork } from './gateway';
import { mergeEpisodes, type EpisodeCandidate, type MergedEpisode } from './mergedEpisodes';

export function ChapterLinkEditor({ works, links, onChange }: { works: VideoWork[]; links: VideoChapterLink[]; onChange(value: VideoChapterLink[]): void }) {
  const hasBangumi = works.some(work => work.source === 'bangumi');
  const hasTmdb = works.some(work => work.source === 'tmdbTv');
  const groups = hasBangumi && hasTmdb ? mergeEpisodes(works, links) : [];
  const pending = groups.map(group => ({...group, rows: group.rows.filter(row => row.unmatched || row.chapterLink)})).filter(group => group.rows.length);
  function link(row: MergedEpisode, candidate: EpisodeCandidate) {
    const bangumi = row.source === 'bangumi' ? String(row.id) : candidate.id;
    const tmdb = row.source === 'tmdbTv' ? String(row.id) : candidate.id;
    if (!bangumi || !tmdb) return;
    onChange([...links.filter(link => link.bangumi !== bangumi && link.tmdb !== tmdb), { bangumi, tmdb }]);
  }
  function unlink(row: MergedEpisode) {
    if (!row.chapterLink) return;
    onChange(links.filter(link => link.bangumi !== row.chapterLink!.bangumi || link.tmdb !== row.chapterLink!.tmdb));
  }
  return <section className="video-chapter-links-editor">
    <div className="video-section-heading">
      <h3>章节关联</h3>
      <span className="setting-hint">自动按集数／日期对应；未对应的可手动选择</span>
    </div>
    {!hasBangumi || !hasTmdb ? <p className="form-note">同时关联 Bangumi 与 TMDB 剧集后，才能对应章节。</p>
      : !groups.length ? <p className="form-note">还没有可对应的章节。先在资料页读取并保存 Bangumi／TMDB 章节。</p>
      : !pending.length ? <p className="form-note">当前章节均已自动对应，没有需要手动处理的行。</p>
      : pending.map(group => <div className="video-chapter-link-group" key={group.key}>
        {!!group.label.trim() && <h4>{group.label}</h4>}
        {group.rows.map(row => {
          const title = row.originalTitle || row.title || `第 ${row.number} 集`;
          return <div className="video-chapter-link-row" key={row.key}>
            <span>{row.number}</span>
            <div className="video-chapter-link-copy">
              <strong>{title}</strong>
              {row.title && row.title !== row.originalTitle && <small>{row.title}</small>}
              <small>{[row.airDate, row.duration, row.unmatched ? '未关联' : row.sources.join(' · ')].filter(Boolean).join(' · ')}</small>
              {row.chapterLink && <button type="button" className="text-button" onClick={() => unlink(row)}>解除关联</button>}
            </div>
            <div className="video-chapter-link-action">
              {!row.chapterLink && !!row.candidates?.length
                ? <Select label={`第 ${row.number} 集对应章节`} value="" options={[{id:'',label:'选择对应章节'},...row.candidates.map(candidate => ({id:candidate.id,label:candidate.label}))]}
                  onChange={value => { const candidate = row.candidates?.find(item => item.id === value); if (candidate) link(row, candidate); }}/>
                : row.chapterLink ? <span className="setting-hint">手动关联</span>
                : row.unmatched ? <span className="setting-hint">无可用章节</span> : null}
            </div>
          </div>;
        })}
      </div>)}
  </section>;
}
