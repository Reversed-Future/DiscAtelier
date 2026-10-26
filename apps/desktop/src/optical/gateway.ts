import { Channel, invoke } from '@tauri-apps/api/core';

export interface CdTrack { number: number; durationSeconds: number }
export interface CdTrackMetadata {
  number: number; title: string | null; artist: string | null; album: string | null;
  date: string | null; genre: string | null; trackTotal: number | null;
}
export interface OpticalMedium {
  label: string; fileSystem: string; token: string; kind: 'bluray' | 'dvdVideo' | 'audioCd' | 'other';
  tracks: CdTrack[]; playlists: string[]; discId: string | null; aacsDirectory: boolean; bdplusDirectory: boolean; javaDirectory: boolean;
}
export interface OpticalDrive {
  mountPoint: string; name: string; status: 'empty' | 'ready' | 'unavailable';
  medium: OpticalMedium | null; error: string | null;
}
export interface PlaybackDiagnostic { status: string; message: string; details: string }
export interface MenuRecognition {
  title: string; creator: string; editionLabel: string; confidence: number;
  reason: string; visibleText: string; image: string;
  matches: MenuDiscMatch[]; binding: OpticalBinding | null; associationMessage: string;
}
export interface OpticalDisc { key: string; label: string; title: string }
export interface MenuDiscMatch { copyId: string; title: string; discKey: string; discLabel: string; score: number; reason: string }
export interface MusicBrainzRelease { releaseId: string; title: string; artist: string; date: string; country: string }
export interface KeydbStatus { configured: boolean; bytes: number; entries: number; sources: string[]; updatedAt: string | null }
export interface KeydbImport { status: KeydbStatus; replacedExisting: boolean; englishSupplemented: boolean }
export interface KeydbProgress { phase: string; message: string; percent: number | null; received: number; total: number | null }
export interface OpticalBinding { mediaToken: string; copyId: string; title: string; creator: string; label: string; discKey: string | null; discLabel: string | null }
export interface OpticalPresence {
  copyId: string; title: string; creator: string; drive: string; mountPoint: string;
  mediaToken: string; label: string; playing: boolean;
  discKey: string | null; discLabel: string | null;
}
export interface DvdChapter { index: number; startSeconds: number; durationSeconds: number }
export interface OpticalCandidate {
  copyId: string; editionId: string; title: string; creator: string;
  editionLabel: string; categoryId: string; score: number; matchKind: 'title' | 'edition' | 'catalog' | 'barcode' | 'creator' | 'none';
}
export interface PlaybackSettings { mpvExecutable: string; makeMkvLibrary: string; vlcLibrary: string; makeMkvFallback: boolean; smtcEnabled: boolean }
export const optical = {
  list: () => invoke<OpticalDrive[]>('optical_list'),
  eject: (mountPoint: string) => invoke<void>('optical_eject', { mountPoint }),
  musicbrainz: (discId: string) => invoke<MusicBrainzRelease[]>('musicbrainz_disc', { discId }),
  cdMetadata: (mountPoint: string, token: string, refresh = false) => invoke<CdTrackMetadata[]>('optical_cd_metadata', { mountPoint, token, refresh }),
  probe: (mountPoint: string, token: string, playlist: string) => invoke<PlaybackDiagnostic>('optical_probe', { mountPoint, token, playlist }),
  menuRecognize: (mountPoint: string, token: string, label: string, kind: 'dvd' | 'bluray', progress: (message: string) => void) => {
    const onProgress = new Channel<string>(); onProgress.onmessage = progress;
    return invoke<MenuRecognition>('optical_menu_recognize', { request: { mountPoint, token, label, kind }, onProgress });
  },
  settings: () => invoke<PlaybackSettings>('playback_settings_get'),
  saveSettings: (settings: PlaybackSettings) => invoke<void>('playback_settings_save', { settings }),
  keydbStatus: () => invoke<KeydbStatus>('bluray_key_status'),
  importKeydb: (data: string) => invoke<KeydbImport>('bluray_key_import', { data }),
  downloadKeydb: (progress: (value: KeydbProgress) => void) => {
    const onProgress = new Channel<KeydbProgress>(); onProgress.onmessage = progress;
    return invoke<KeydbImport>('bluray_key_download', { onProgress });
  },
  presence: () => invoke<OpticalPresence[]>('optical_presence'),
  candidates: (label: string, query: string) => invoke<OpticalCandidate[]>('optical_candidates', { label, query }),
  discs: (editionId: string) => invoke<OpticalDisc[]>('optical_discs', { editionId }),
  associate: (mediaToken: string, copyId: string, label: string, discKey: string | null = null) => invoke<OpticalBinding>('optical_associate', { mediaToken, copyId, label, discKey }),
  unbind: (mediaToken: string) => invoke<void>('optical_unbind', { mediaToken }),
  dvdChapters: (mountPoint: string, token: string, title: number) =>
    invoke<DvdChapter[]>('optical_dvd_chapters', { mountPoint, token, title }),
};
