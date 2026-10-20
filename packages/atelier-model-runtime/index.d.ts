export interface ModelState {
  step: number; stateId: string; busy: boolean; held: string | null;
  returns: {target: string; label: string}[];
}
export interface ModelPackage {
  version: 2; id: string; title: string; creator: string; cover: string;
  initialState: string;
}
export interface ModelHandle {
  reset(): Promise<void>;
  activate(target: string | null): Promise<void>;
  setInteractive(value: boolean): void;
  capturePreview(): Promise<{blob: Blob; width: number; height: number}>;
  screenBounds(): {left: number; top: number; width: number; height: number};
  putBack(target: string): Promise<void>;
  exitInspection(): Promise<void>;
  dispose(): void;
  readonly state: ModelState;
}
export const modelFileLimit: number;
export function parseModel(text: string): ModelPackage;
export function mountModel(host: HTMLElement, model: ModelPackage, options?: {
  signal?: AbortSignal; interactive?: boolean;
  onChange?(state: ModelState): void; onError?(error: unknown): void;
}): Promise<ModelHandle>;
