import type { MediumDraft } from '../library/types';

export function physicalDiscNumber(key: string, media: readonly MediumDraft[]): number | null {
  const ordinal = /^(?:(?:manual|section):)?([1-9]\d*)$/.exec(key);
  if (ordinal) return Number(ordinal[1]) <= media.length ? Number(ordinal[1]) : null;
  const carrier = /^(CD|DVD|BD|BR)([1-9]\d*)?$/.exec(key);
  if (!carrier) return key === 'unassigned' && media.length === 1 ? 1 : null;
  const id = ({ CD: 'cd', DVD: 'dvd', BD: 'bd', BR: 'bd' } as Record<string, string>)[carrier[1]];
  const slots = media.flatMap((row, index) => row.carrierId === id ? [index + 1] : []);
  return slots[Number(carrier[2] || 1) - 1] ?? null;
}

export function physicalDiscLabel(medium: MediumDraft, index: number): string {
  const label = ({ cd: 'CD', dvd: 'DVD', bd: 'BD' } as Record<string, string>)[medium.carrierId] || medium.label;
  return `Disc ${index + 1} · ${label}`;
}
