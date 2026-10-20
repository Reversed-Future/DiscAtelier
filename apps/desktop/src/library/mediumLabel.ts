import type { Descriptor, MediumDraft } from './types';

/** Only suppress an exact, delimited repetition of the registered carrier name. */
export function mediumLabel(medium: MediumDraft, carriers: Descriptor[]): string {
  const carrier = carriers.find(item => item.id === medium.carrierId)?.label || medium.carrierId;
  if (!medium.label) return carrier;
  if (medium.label === carrier || medium.label.startsWith(`${carrier} · `)) return medium.label;
  return `${carrier} · ${medium.label}`;
}
