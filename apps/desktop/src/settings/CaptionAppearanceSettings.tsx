import type { CaptionAppearance } from '../playback/captionAppearance';
import { CaptionPreview } from './CaptionPreview';

interface Props {
  value: CaptionAppearance;
  bilingual: boolean;
  disabled: boolean;
  onChange(value: CaptionAppearance): void;
}

export function CaptionAppearanceSettings({ value, bilingual, disabled, onChange }: Props) {
  const sliders = [
    { key: 'fontSize', label: '字号', min: 14, max: 48, unit: ' px' },
    { key: 'backgroundOpacity', label: '背景不透明度', min: 0, max: 100, unit: '%' },
    { key: 'verticalPosition', label: '垂直位置', min: 0, max: 100, unit: '%' },
  ] as const;
  return <section>
    <h4 className="settings-subheading">字幕外观</h4>
    <CaptionPreview value={value} bilingual={bilingual}/>
    {sliders.map(({ key, label, min, max, unit }) => <label className="setting-row caption-slider" key={key}>
      <span>{label}</span><input type="range" aria-label={label} min={min} max={max} step={1}
        value={value[key]} disabled={disabled} onChange={e => onChange({ ...value, [key]: e.currentTarget.valueAsNumber })}/>
      <output>{value[key]}{unit}</output>
    </label>)}
    <p className="setting-hint">背景不透明度为 0% 时只显示文字。垂直位置从画面顶部（0%）到底部（100%）。</p>
  </section>;
}
