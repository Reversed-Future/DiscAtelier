import { Icon } from '../ui/Icon';
import type { AssistantController } from './useAssistant';

const pages = [
  { view: 'history', label: '历史会话', icon: 'history' },
  { view: 'logs', label: '操作记录', icon: 'list' },
] as const;

export function AssistantHeader({ view, navigate, onNew, disableNew, onClose }: {
  view: AssistantController['view']; navigate(view: AssistantController['view']): void;
  onNew(): void; disableNew: boolean; onClose(): void;
}) {
  return <header className="assistant-dock-heading">
    {view !== 'chat' && <button type="button" className="icon-button assistant-back" aria-label="返回对话" data-tooltip="返回对话" onClick={() => navigate('chat')}><Icon name="back"/></button>}
    <h3 id="assistant-chat-title">{pages.find(page => page.view === view)?.label ?? '助手'}</h3>
    <button type="button" className="assistant-new" disabled={disableNew} onClick={onNew}><Icon name="plus"/>新会话</button>
    {pages.map(page => <button key={page.view} type="button" className="icon-button" data-tooltip={page.label}
      aria-label={page.label} aria-pressed={view === page.view} onClick={() => navigate(view === page.view ? 'chat' : page.view)}>
      <Icon name={page.icon}/>
    </button>)}
    <button type="button" className="icon-button assistant-close" aria-label="收起助手" data-tooltip="收起助手" onClick={onClose}><Icon name="close"/></button>
  </header>;
}
