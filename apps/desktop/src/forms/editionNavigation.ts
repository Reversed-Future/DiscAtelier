import { useLayoutEffect, useRef, useState } from 'react';
import type { Descriptor, EditionDraft } from '../library/types';
import type { VideoMetadata } from '../video/gateway';
import { videoWorks } from '../video/sources';
import { partIssue } from '../video/parts';

export type EditorPage = 'edition' | 'discs' | 'content' | 'model' | 'purchase';
export interface FieldIssue { page: EditorPage; message: string; selector: string; disc?: number; work?: number }

export function editionIssue(edition: EditionDraft, carriers: Descriptor[], video: VideoMetadata): FieldIssue | null {
  if (!edition.title.trim()) return {page: 'edition', selector: 'input[aria-label="名称"]', message: '请填写名称'};
  const invalid = edition.media.findIndex(row => !carriers.some(carrier => carrier.id === row.carrierId));
  if (invalid >= 0) return {page: 'discs', disc: invalid + 1, message: `请选择第 ${invalid + 1} 张碟片的载体`,
    selector: edition.categoryId === 'video' ? 'button[aria-label="当前碟片载体"]' : `button[aria-label="第 ${invalid + 1} 张载体"]`};
  const emptyTitle = edition.categoryId === 'video' ? videoWorks(video).findIndex(work => !work.title.trim()) : -1;
  if (emptyTitle >= 0) return {page: 'content', work: emptyTitle, selector: 'input[aria-label="作品标题"]', message: '请填写作品标题'};
  const issue = edition.categoryId === 'video' && partIssue(video);
  return issue ? { ...issue, page: 'content' } : null;
}

export function useEditionNavigation(initial: EditorPage = 'edition') {
  const [page, setPage] = useState(initial);
  const [issue, setIssue] = useState<FieldIssue | null>(null);
  const [target, setTarget] = useState<Pick<FieldIssue, 'disc' | 'work'>>({});
  const form = useRef<HTMLFormElement>(null);
  useLayoutEffect(() => {
    const element = form.current;
    if (!issue || !element) return;
    let field: HTMLElement | null = null;
    const observer = new MutationObserver(focus);
    function focus() {
      field = element!.querySelector<HTMLElement>(issue!.selector);
      if (!field || field.matches(':disabled')) return;
      observer.disconnect();
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', 'edition-validation');
      field.focus({preventScroll: true});
      field.scrollIntoView({block: 'nearest'});
    }
    observer.observe(element, {childList: true, subtree: true, attributes: true, attributeFilter: ['disabled']});
    focus();
    return () => { observer.disconnect(); field?.removeAttribute('aria-invalid'); field?.removeAttribute('aria-describedby'); };
  }, [issue]);
  function navigate(next: EditorPage) { setIssue(null); setTarget({}); setPage(next); }
  function report(problem: FieldIssue) { setPage(problem.page); setTarget(problem); setIssue(problem); }
  return { page, form, issue, target, navigate, report, clear: () => setIssue(null) };
}
