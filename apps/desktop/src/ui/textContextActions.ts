import { copyAction, type ContextAction } from './contextActions';

export function textContextActions(target: Element, event: MouseEvent): ContextAction[] {
  const field = target.closest('input, textarea');
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed || !selection.containsNode(target, true)) return [];
    if (event.button === 2) {
      const overText = Array.from(selection.getRangeAt(0).getClientRects()).some(rect =>
        event.clientX >= rect.left && event.clientX < rect.right && event.clientY >= rect.top && event.clientY < rect.bottom);
      if (!overText) return [];
    }
    const text = selection.toString();
    return text ? [copyAction('复制', text)] : [];
  }
  const start = field.selectionStart, end = field.selectionEnd;
  if (start === null || end === null || field.matches(':disabled')) return [];
  const original = field.value, selected = original.slice(start, end);
  const secret = field instanceof HTMLInputElement && field.type === 'password';
  const actions: ContextAction[] = [];
  const restoreRange = () => {
    if (!field.isConnected || field.value !== original || field.matches(':disabled, [readonly]')) return false;
    field.focus();
    field.setSelectionRange(start, end);
    return true;
  };
  const stillSelected = () => document.activeElement === field && field.value === original
    && field.selectionStart === start && field.selectionEnd === end && !field.matches(':disabled, [readonly]');
  if (selected && !secret) {
    if (!field.readOnly) actions.push({label: '剪切', run: async () => {
      if (!restoreRange()) return;
      await navigator.clipboard.writeText(selected);
      if (stillSelected() && !document.execCommand('delete')) throw new Error('无法剪切选中的文字。');
    }});
    actions.push(copyAction('复制', selected));
  }
  if (!field.readOnly) actions.push({label: '粘贴', run: async () => {
    if (!restoreRange()) return;
    const text = await navigator.clipboard.readText();
    if (text && stillSelected() && !document.execCommand('insertText', false, text)) throw new Error('无法粘贴文字。');
  }});
  actions.push({label: '全选', run: () => { field.focus(); field.select(); }});
  return actions;
}
