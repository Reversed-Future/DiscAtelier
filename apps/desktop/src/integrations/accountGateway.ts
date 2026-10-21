import { invoke } from '@tauri-apps/api/core';
export interface NeteaseAccountState { state: 'loggedOut' | 'loggedIn' | 'expired'; nickname: string | null; avatarUrl: string | null }
export interface LoginPoll { phase: 'waiting' | 'confirming' | 'loggedIn' | 'expired'; account: NeteaseAccountState | null }
export const accountApi = {
  status: () => invoke<NeteaseAccountState>('netease_account_status'),
  begin: (requestId: string) => invoke<{ image: string }>('netease_login_begin', { requestId }),
  poll: (requestId: string) => invoke<LoginPoll>('netease_login_poll', { requestId }),
  cancel: (requestId: string) => invoke<void>('netease_login_cancel', { requestId }),
  logout: () => invoke<NeteaseAccountState>('netease_account_logout'),
};
