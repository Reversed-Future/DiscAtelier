import type { MouseEvent as ReactMouseEvent } from 'react';

export interface ContextAction { label: string; run(): void | Promise<void>; separator?: boolean }

// A row supplies its own actions as the event bubbles to the single document menu.
const rowActions = new WeakMap<MouseEvent, ContextAction[]>();
export function setContextActions(event: ReactMouseEvent, actions: ContextAction[]) {
  if (!rowActions.has(event.nativeEvent)) rowActions.set(event.nativeEvent, actions);
}
export function getContextActions(event: MouseEvent) { return rowActions.get(event); }
export function copyAction(label: string, text: string): ContextAction {
  return { label, run: () => navigator.clipboard.writeText(text) };
}
