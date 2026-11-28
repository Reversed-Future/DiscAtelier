import type { Descriptor, EditionDraft } from '../library/types';
import type { EditionContent } from '../metadata/gateway';
import { changeVideoMedia, videoDiscPages } from '../video/physicalContents';
import { Select } from '../ui/Select';
import { Icon } from '../ui/Icon';

export function MusicMediaFields({value, carriers, onChange, content, onContent}: {
  value: EditionDraft; carriers: Descriptor[]; onChange(value: EditionDraft): void;
  content: EditionContent; onContent(value: EditionContent): void;
}) {
  const pages = videoDiscPages(content.tracks, value);
  function remove(index: number) {
    const media = value.media.filter((_, position) => position !== index);
    onContent(changeVideoMedia(content, value, media, index + 1));
    onChange({...value, media});
  }
  return <><div className="media-heading"><span>载体</span><button type="button" className="text-button" disabled={value.media.length >= 99} onClick={() => onChange({ ...value, media: [...value.media, { carrierId: 'cd', label: '' }] })}><Icon name="plus"/>加一张</button></div>
    {value.media.map((medium, index) => <div className="medium-row" key={index}>
      <span className="medium-number">{String(index + 1).padStart(2, '0')}</span>
      <Select label={`第 ${index + 1} 张载体`} value={medium.carrierId} options={medium.carrierId ? carriers : [{ id: '', label: '选择载体' }, ...carriers]} onChange={text => onChange({ ...value, media: value.media.map((item, position) => position === index ? { ...item, carrierId: text } : item) })}/>
      <input aria-label={`第 ${index + 1} 张名称`} value={medium.label} maxLength={200} placeholder="名称" onChange={event => onChange({ ...value, media: value.media.map((item, position) => position === index ? { ...item, label: event.target.value } : item) })}/>
      <button type="button" className="icon-button" aria-label={`移除第 ${index + 1} 张`} disabled={value.media.length === 1 || !!pages[index]?.entries?.length} title="请先移走这张碟片的曲目" onClick={() => remove(index)}><Icon name="close"/></button>
    </div>)}</>;
}
