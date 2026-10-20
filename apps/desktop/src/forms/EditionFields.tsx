import type { Descriptor, EditionDraft } from '../library/types';
import { Select } from '../ui/Select';
import { Icon } from '../ui/Icon';

export function EditionFields({ value, onChange, categories, carriers }: {
  value: EditionDraft; onChange(value: EditionDraft): void; categories: Descriptor[]; carriers: Descriptor[];
}) {
  const change = (key: keyof EditionDraft, text: string) => onChange({ ...value, [key]: text });
  return <>
    <label>名称<input aria-label="名称" autoFocus value={value.title} maxLength={200} onChange={event => change('title', event.target.value)}/></label>
    <div className="form-row"><label>作者<input aria-label="作者" value={value.creator} maxLength={200} onChange={event => change('creator', event.target.value)}/></label>
      <label>分区<Select label="分区" value={value.categoryId} options={categories} onChange={text => change('categoryId', text)}/></label></div>
    <label>版本<input aria-label="版本" value={value.editionLabel} maxLength={200} placeholder="如：初回限定版" onChange={event => change('editionLabel', event.target.value)}/></label>
    <div className="form-row"><label>条码<input aria-label="条码" value={value.barcode} maxLength={200} onChange={event => change('barcode', event.target.value)}/></label>
      <label>品番<input aria-label="品番" value={value.catalogNumber} maxLength={200} onChange={event => change('catalogNumber', event.target.value)}/></label></div>
    <div className="media-heading"><span>载体</span><button type="button" className="text-button" disabled={value.media.length >= 99} onClick={() => onChange({ ...value, media: [...value.media, { carrierId: 'cd', label: '' }] })}><Icon name="plus"/>加一张</button></div>
    {value.media.map((medium, index) => <div className="medium-row" key={index}>
      <span className="medium-number">{String(index + 1).padStart(2, '0')}</span>
      <Select label={`第 ${index + 1} 张载体`} value={medium.carrierId} options={medium.carrierId ? carriers : [{ id: '', label: '选择载体' }, ...carriers]} onChange={text => onChange({ ...value, media: value.media.map((item, position) => position === index ? { ...item, carrierId: text } : item) })}/>
      <input aria-label={`第 ${index + 1} 张名称`} value={medium.label} maxLength={200} placeholder="名称" onChange={event => onChange({ ...value, media: value.media.map((item, position) => position === index ? { ...item, label: event.target.value } : item) })}/>
      <button type="button" className="icon-button" aria-label={`移除第 ${index + 1} 张`} disabled={value.media.length === 1} onClick={() => onChange({ ...value, media: value.media.filter((_, position) => position !== index) })}><Icon name="close"/></button>
    </div>)}
  </>;
}
