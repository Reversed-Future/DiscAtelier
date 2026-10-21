import { Converter } from 'opencc-js/t2cn';

let simplify: ReturnType<typeof Converter> | undefined;
/** Comparison only. Stored titles and link identifiers always retain their source text. */
export function comparableTitle(title: string): string {
  simplify ||= Converter({ from: 'tw', to: 'cn' });
  return simplify(title.normalize('NFKC')).toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, '');
}
