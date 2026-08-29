export interface PlayerEpisodeSelectorItem {
  durationSeconds?: number | null;
  itemId: string;
  thumbnailHeight?: number | null;
  thumbnailPath?: string | null;
  thumbnailStride?: number | null;
  thumbnailUrl?: string | null;
  thumbnailWidth?: number | null;
  title: string;
}

export interface PlayerEpisodeSelector {
  currentItemId: string;
  episodes: PlayerEpisodeSelectorItem[];
}

export interface PlayerPlaybackSelection {
  mediaSourceId: string | null;
  audioStreamIndex: number | null;
}

export interface PlaybackStartupAttemptInput {
  launchRequestId: number;
  itemId: string;
  title: string;
  selection: PlayerPlaybackSelection;
  resumeIntent: number | null;
}

export interface PlayerOpenInput {
  launchRequestId: number;
  itemId: string;
  title: string;
  episodeSelector?: PlayerEpisodeSelector;
}

export interface PlayerOpenResult {
  launchRequestId: number;
  playerSessionId: number;
}

export interface PlayerLoadInput extends PlayerOpenInput {
  playerSessionId: number;
  loadRequestId: number;
  streamUrl: string;
  httpHeaders?: Record<string, string>;
  startSeconds?: number;
  authMode?: 'header' | 'local-proxy' | 'tokenless';
  mediaSourceId?: string | null;
  playSessionId?: string | null;
  audioStreamIndex?: number | null;
}

export type PlayerStartupPhase =
  | 'surface-ready'
  | 'media-loading'
  | 'media-ready'
  | 'first-frame'
  | 'failed'
  | 'closed';

export interface PlayerStartupEvent {
  playerSessionId: number;
  launchRequestId: number;
  loadRequestId?: number;
  itemId: string;
  phase: PlayerStartupPhase;
  message?: string;
  retryable?: boolean;
}

export interface PlayerRetryRequest {
  playerSessionId: number;
  launchRequestId: number;
  itemId: string;
  failedLoadRequestId: number;
}

export interface PlayerStartupFailureInput {
  playerSessionId: number;
  launchRequestId: number;
  loadRequestId: number;
  itemId: string;
  message: string;
}

const startupPhases = new Set<PlayerStartupPhase>([
  'surface-ready',
  'media-loading',
  'media-ready',
  'first-frame',
  'failed',
  'closed',
]);

const mediaPhases = new Set<PlayerStartupPhase>([
  'media-loading',
  'media-ready',
  'first-frame',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPositiveIdentity(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isSafePlayerDisplayText(value: unknown): value is string {
  if (!isNonEmptyString(value) || value.length > 500) return false;
  return !/(?:https?:\/\/|authorization\s*:|proxy-authorization\s*:|bearer\s+|api[_-]?key\s*[=:]|access[_-]?token\s*[=:]|[?&](?:token|api_key|access_token)=)/i.test(value);
}

function isEpisodeSelector(value: unknown): value is PlayerEpisodeSelector {
  if (!isRecord(value) || !isNonEmptyString(value.currentItemId) || !Array.isArray(value.episodes)) {
    return false;
  }
  return value.episodes.every((episode) => isRecord(episode) &&
    isNonEmptyString(episode.itemId) && isSafePlayerDisplayText(episode.title));
}

export function isPlayerOpenInput(value: unknown): value is PlayerOpenInput {
  if (!isRecord(value)) return false;
  return isPositiveIdentity(value.launchRequestId) &&
    isNonEmptyString(value.itemId) &&
    isSafePlayerDisplayText(value.title) &&
    (value.episodeSelector === undefined || isEpisodeSelector(value.episodeSelector));
}

export function isPlayerLoadInput(value: unknown): value is PlayerLoadInput {
  if (!isRecord(value) || !isPlayerOpenInput(value)) return false;
  if (!isPositiveIdentity(value.playerSessionId) || !isPositiveIdentity(value.loadRequestId)) return false;
  if (!isNonEmptyString(value.streamUrl)) return false;
  if (value.startSeconds !== undefined &&
      (typeof value.startSeconds !== 'number' || !Number.isFinite(value.startSeconds) || value.startSeconds < 0)) {
    return false;
  }
  if (value.httpHeaders !== undefined && (!isRecord(value.httpHeaders) ||
      !Object.values(value.httpHeaders).every((header) => typeof header === 'string'))) {
    return false;
  }
  if (value.authMode !== undefined && !['header', 'local-proxy', 'tokenless'].includes(String(value.authMode))) {
    return false;
  }
  return value.audioStreamIndex === undefined || value.audioStreamIndex === null ||
    (Number.isInteger(value.audioStreamIndex) && Number(value.audioStreamIndex) >= 0);
}

export function isPlayerStartupEvent(value: unknown): value is PlayerStartupEvent {
  if (!isRecord(value) ||
      !isPositiveIdentity(value.playerSessionId) ||
      !isPositiveIdentity(value.launchRequestId) ||
      !isNonEmptyString(value.itemId) ||
      !startupPhases.has(value.phase as PlayerStartupPhase)) {
    return false;
  }
  const phase = value.phase as PlayerStartupPhase;
  if (mediaPhases.has(phase) && !isPositiveIdentity(value.loadRequestId)) return false;
  if (value.loadRequestId !== undefined && !isPositiveIdentity(value.loadRequestId)) return false;
  if (value.message !== undefined && !isSafePlayerDisplayText(value.message)) return false;
  if (value.retryable !== undefined && typeof value.retryable !== 'boolean') return false;
  if (phase === 'failed' && typeof value.retryable !== 'boolean') return false;
  return true;
}

export function isPlayerRetryRequest(value: unknown): value is PlayerRetryRequest {
  if (!isRecord(value)) return false;
  return isPositiveIdentity(value.playerSessionId) &&
    isPositiveIdentity(value.launchRequestId) &&
    isPositiveIdentity(value.failedLoadRequestId) &&
    isNonEmptyString(value.itemId);
}

export function isPlayerStartupFailureInput(value: unknown): value is PlayerStartupFailureInput {
  if (!isRecord(value)) return false;
  return isPositiveIdentity(value.playerSessionId) &&
    isPositiveIdentity(value.launchRequestId) &&
    isPositiveIdentity(value.loadRequestId) &&
    isNonEmptyString(value.itemId) &&
    isSafePlayerDisplayText(value.message);
}
