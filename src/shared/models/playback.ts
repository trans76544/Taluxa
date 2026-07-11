export type PlayerStopReason = 'eof' | 'stop' | 'quit' | 'switch' | 'replace' | 'error';

interface PlayerPlaybackEventBase {
  playbackId: string;
  sequence: number;
  itemId: string;
  positionSeconds: number;
  durationSeconds: number;
}

export type PlayerPlaybackEvent =
  | (PlayerPlaybackEventBase & { phase: 'started' | 'progress' })
  | (PlayerPlaybackEventBase & { phase: 'stopped'; reason: PlayerStopReason; completed: boolean });

export function isPlayerPlaybackEvent(value: unknown): value is PlayerPlaybackEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<PlayerPlaybackEvent>;
  const validBase = typeof event.playbackId === 'string' && event.playbackId.length > 0 &&
    Number.isInteger(event.sequence) && (event.sequence ?? -1) >= 0 &&
    typeof event.itemId === 'string' && event.itemId.length > 0 &&
    typeof event.positionSeconds === 'number' && Number.isFinite(event.positionSeconds) && event.positionSeconds >= 0 &&
    typeof event.durationSeconds === 'number' && Number.isFinite(event.durationSeconds) && event.durationSeconds >= 0;
  if (!validBase) return false;
  if (event.phase === 'started' || event.phase === 'progress') return true;
  return event.phase === 'stopped' &&
    ['eof', 'stop', 'quit', 'switch', 'replace', 'error'].includes(String(event.reason)) &&
    typeof event.completed === 'boolean';
}
