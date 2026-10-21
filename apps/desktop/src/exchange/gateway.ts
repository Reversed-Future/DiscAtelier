import { invoke } from '@tauri-apps/api/core';

export interface ExchangeSettings { enabled: boolean; developerId: string; target: string }
export interface Quote { from: string; to: string; rate: string; updatedAt: string; fetchedDate: string }
export interface ExchangeStatus {
  settings: ExchangeSettings; hasKey: boolean; rates: Quote[]; today: string; attemptDate: string; lastAttemptAt: number; error: string;
}
export const exchange = {
  openDocs: () => invoke<void>('exchange_open_docs'),
  status: () => invoke<ExchangeStatus>('exchange_status'),
  refresh: (force = false) => invoke<ExchangeStatus>('exchange_refresh', { force }),
  save: (settings: ExchangeSettings, apiKey: string | null, forgetKey = false) => invoke<ExchangeStatus>('exchange_save', { settings, apiKey, forgetKey }),
};
