export function localDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setFullYear(year, month, day);
  date.setHours(12, 0, 0, 0);
  return date;
}
export function dateValue(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function readDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = localDate(year, month - 1, day);
  return year >= 1 && dateValue(date) === value ? date : null;
}
export function monthDays(date: Date): Date[] {
  const start = localDate(date.getFullYear(), date.getMonth(), 1);
  const offset = (start.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => localDate(date.getFullYear(), date.getMonth(), index + 1 - offset));
}
export function moveMonth(date: Date, offset: number): Date {
  const first = localDate(date.getFullYear(), date.getMonth() + offset, 1);
  const last = localDate(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return localDate(first.getFullYear(), first.getMonth(), Math.min(date.getDate(), last));
}
