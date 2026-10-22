import { invoke } from '@tauri-apps/api/core';
import type { CreateCopy, UpdateEdition } from '../library/types';
export type VideoSource = 'tmdbMovie' | 'tmdbTv' | 'bangumi';
export interface VideoFact { label: string; values: { text: string; url: string }[] }
export interface VideoCharacter { name: string; role: string; actors: string[]; portraitUrl?: string; facts?: VideoFact[]; actorPortraits?: { name: string; portraitUrl: string }[] }
export interface VideoImage { kind: 'poster' | 'backdrop'; url: string; previewUrl: string; width: number; height: number; language: string }
export interface VideoChapter { id: number; group: string; number: string; title: string; originalTitle: string; airDate: string; duration: string; summary?: string; imageUrl?: string; episodeKind?: number; seasonNumber?: number }
export interface VideoWork { source: VideoSource; externalId: number; title: string; originalTitle: string; summary: string; premiereDate: string; posterUrl: string; episodeCount: number | null; genres: string[]; people: { name: string; role: string }[]; facts?: VideoFact[]; characters?: VideoCharacter[]; chapters?: VideoChapter[] | null; images?: VideoImage[] | null }
export interface VideoPhysical { territory: string; releaseDate: string; volume: string; includedContent: string; packaging: string }
export interface VideoPart { id: string; label: string; sourceKeys: string[]; coverSourceKey: string }
export interface VideoMetadata { parts?: VideoPart[]; work: VideoWork | null; physical: VideoPhysical; additionalWorks?: VideoWork[] }
export const emptyVideo = (): VideoMetadata => ({ work: null, physical: { territory: '', releaseDate: '', volume: '', includedContent: '', packaging: '' } });
export type PackagingKey = 'title' | 'creator' | 'editionLabel' | 'barcode' | 'catalogNumber' | 'territory' | 'releaseDate' | 'volume' | 'includedContent' | 'packaging' | 'discCount' | 'carrier';
export interface PackagingField { key: PackagingKey; value: string; evidence: string; image: number }
export interface Recognition { fields: PackagingField[]; warning: string }
export const video = {
  images: (work: VideoWork) => invoke<VideoImage[]>('video_images', {source: work.source, id: work.externalId}),
  chapters: (work: VideoWork) => invoke<VideoChapter[]>('video_chapters', { source: work.source, id: work.externalId }),
  cover: (work: VideoWork) => invoke<string>('video_cover', { url: posterUrl(work) }),
  search: (source: VideoSource, query: string, page: number) => invoke<{ items: VideoWork[]; page: number; hasMore: boolean }>('video_search', { source, query, page }),
  work: (source: VideoSource, id: number) => invoke<VideoWork>('video_work', { source, id }),
  metadata: (editionId: string) => invoke<VideoMetadata | null>('video_metadata', { editionId }),
  create: (request: CreateCopy, metadata: VideoMetadata) => invoke<string>('video_create', { request, metadata }),
  update: (request: UpdateEdition, metadata: VideoMetadata) => invoke<string>('video_update', { request, metadata }),
  recognize: (pictures: string[]) => invoke<Recognition>('video_recognize', { pictures }),
};
export function workLink(work: VideoWork) {
  return work.source === 'bangumi' ? `https://bgm.tv/subject/${work.externalId}` : `https://www.themoviedb.org/${work.source === 'tmdbMovie' ? 'movie' : 'tv'}/${work.externalId}`;
}
export const sourceLabel = (source: VideoSource) => source === 'bangumi' ? 'Bangumi' : 'TMDB';
export function posterUrl(work: VideoWork) { return videoImageUrl(work.posterUrl); }
export function videoImageUrl(value: string) {
  try { const u = new URL(value); return u.protocol === 'https:' && ['image.tmdb.org', 'lain.bgm.tv'].includes(u.hostname) && !u.port && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
