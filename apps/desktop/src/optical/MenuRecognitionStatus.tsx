import { useEffect, useState } from 'react';

export function MenuRecognitionStatus({ active, message, error }: { active: boolean; message: string; error: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    setSeconds(0);
    if (!active) return;
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return <>
    {active && <div className="setting-hint" role="status"><p>{message || '正在准备菜单识别…'} · 已用 {seconds} 秒</p>
      {seconds >= 30 && <p>仍在等待此阶段完成；上方状态会显示是否已经取得截图。识别失败会在这里保留原因。</p>}
    </div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </>;
}
