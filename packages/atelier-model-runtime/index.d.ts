export interface ModelState {
  source?: { clips: {id: string; label: string}[]; selected: string; playing: boolean };
  controllers?: Record<string,string>;
  step: number; stateId: string; busy: boolean; held: string | null;
  returns: {target: string; label: string}[];
  assembly?: {
    message: string; selected: string;
    actions: {id: string; label: string; disabled: boolean}[];
    parts: {id: string; label: string}[];
  };
}
export interface InteractiveModelPackage {
  version: 2 | 3 | 4; id: string; title: string; creator: string; cover: string;
  initialState?: string;
}
export interface SourceModelPackage {
  format: 'discatelier-source-model'; version: 1; sourceFormat: 'glb' | 'obj' | 'fbx' | 'skp';
  title: string; main: string; cover: string; files: {path: string; content: string}[];
}
export type ModelPackage = InteractiveModelPackage | SourceModelPackage;
export interface ModelHandle {
  reset(): Promise<void>;
  activate(target: string | null): Promise<void>;
  act(id: string): Promise<void>;
  selectPart(id: string): Promise<void>;
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
