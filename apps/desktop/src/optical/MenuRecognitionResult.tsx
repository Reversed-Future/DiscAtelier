import type { MenuRecognition } from './gateway';

export function MenuRecognitionResult({ value, onCorrect, disabled }: { value: MenuRecognition; onCorrect(): void; disabled: boolean }) {
  return <div className="optical-menu-result">
    <div className="optical-recognition">
      <img src={value.image} alt="光盘菜单截图"/>
      <div><strong>AI 判断 · {value.title}</strong>
        <small>{[value.creator, value.editionLabel].filter(Boolean).join(' · ')}</small>
        <p>{value.reason}</p>
      </div>
    </div>
    <div className="optical-link"><span>{value.associationMessage}</span>
      <button className="text-button" disabled={disabled} onClick={onCorrect}>纠正关联</button></div>
  </div>;
}
