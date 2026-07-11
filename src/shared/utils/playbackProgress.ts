import type { PlaybackProgress } from '@shared/models/progress';
import { redactErrorMessage } from '@shared/network/redaction';

export interface ProgressRevision { playbackId: string; sequence: number }

export function isSameProgressRevision(
  progress: PlaybackProgress | undefined,
  revision: ProgressRevision
): boolean {
  return progress?.playbackId === revision.playbackId && (progress.sequence ?? 0) === revision.sequence;
}

export interface ResumePositionInput {
  savedPositionSeconds: number | null;
  serverPositionTicks: number | null;
}

export interface CreateLocalProgressUpdateInput {
  itemId: string;
  positionSeconds: number;
  durationSeconds: number;
  now: string;
  final?: boolean;
}

export interface ShouldSyncPlaybackProgressInput {
  final?: boolean;
  lastReportedAtMs: number | null;
  lastReportedPositionSeconds: number | null;
  nowMs: number;
  positionSeconds: number;
  reportIntervalMs: number;
}

export function getResumePositionSeconds({
  savedPositionSeconds,
  serverPositionTicks,
}: ResumePositionInput): number {
  if (savedPositionSeconds !== null) {
    return savedPositionSeconds;
  }

  if (typeof serverPositionTicks === 'number' && Number.isFinite(serverPositionTicks)) {
    return Math.floor(serverPositionTicks / 10000000);
  }

  return 0;
}

export function createLocalProgressUpdate({
  itemId,
  positionSeconds,
  durationSeconds,
  now,
  final = false,
}: CreateLocalProgressUpdateInput): PlaybackProgress {
  return {
    itemId,
    positionSeconds: Math.max(0, Math.floor(positionSeconds)),
    durationSeconds: Math.max(0, Math.floor(durationSeconds)),
    updatedAt: now,
    serverStatus: 'pending',
    retryCount: 0,
    final,
  };
}

export function createConfirmedProgressUpdate(
  progress: PlaybackProgress,
  now: string
): PlaybackProgress {
  return {
    ...progress,
    serverStatus: 'confirmed',
    lastServerAttemptAt: now,
    lastServerConfirmedAt: now,
    errorMessage: undefined,
  };
}

export function createFailedProgressUpdate(
  progress: PlaybackProgress,
  error: unknown,
  now: string
): PlaybackProgress {
  return {
    ...progress,
    serverStatus: 'failed',
    lastServerAttemptAt: now,
    retryCount: (progress.retryCount ?? 0) + 1,
    errorMessage: redactErrorMessage(error),
  };
}

export function shouldSyncPlaybackProgress({
  final = false,
  lastReportedAtMs,
  lastReportedPositionSeconds,
  nowMs,
  positionSeconds,
  reportIntervalMs,
}: ShouldSyncPlaybackProgressInput): boolean {
  if (final) {
    return true;
  }

  if (lastReportedPositionSeconds === positionSeconds) {
    return false;
  }

  return lastReportedAtMs === null || nowMs - lastReportedAtMs >= reportIntervalMs;
}
