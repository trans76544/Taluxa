import { describe, expect, it } from 'vitest';
import {
  createConfirmedProgressUpdate,
  createFailedProgressUpdate,
  createLocalProgressUpdate,
  getResumePositionSeconds,
  shouldSyncPlaybackProgress,
} from './playbackProgress';

describe('getResumePositionSeconds', () => {
  it('uses locally saved progress over server ticks', () => {
    expect(
      getResumePositionSeconds({
        savedPositionSeconds: 42,
        serverPositionTicks: 15_000_000,
      })
    ).toBe(42);
  });

  it('falls back to converting server ticks to seconds', () => {
    expect(
      getResumePositionSeconds({
        savedPositionSeconds: null,
        serverPositionTicks: 15_999_999,
      })
    ).toBe(1);
  });
});

describe('playback progress sync helpers', () => {
  it('creates local-first pending progress updates', () => {
    expect(
      createLocalProgressUpdate({
        itemId: 'item-1',
        positionSeconds: 12.7,
        durationSeconds: 180.9,
        now: '2026-06-29T00:00:00.000Z',
      })
    ).toEqual({
      itemId: 'item-1',
      positionSeconds: 12,
      durationSeconds: 180,
      updatedAt: '2026-06-29T00:00:00.000Z',
      serverStatus: 'pending',
      retryCount: 0,
      final: false,
    });
  });

  it('marks progress confirmed after server sync succeeds', () => {
    const local = createLocalProgressUpdate({
      itemId: 'item-1',
      positionSeconds: 12,
      durationSeconds: 180,
      now: '2026-06-29T00:00:00.000Z',
    });

    expect(createConfirmedProgressUpdate(local, '2026-06-29T00:00:01.000Z')).toEqual({
      ...local,
      serverStatus: 'confirmed',
      lastServerAttemptAt: '2026-06-29T00:00:01.000Z',
      lastServerConfirmedAt: '2026-06-29T00:00:01.000Z',
      errorMessage: undefined,
    });
  });

  it('keeps local progress when server sync fails and redacts the error', () => {
    const local = createLocalProgressUpdate({
      itemId: 'item-1',
      positionSeconds: 12,
      durationSeconds: 180,
      now: '2026-06-29T00:00:00.000Z',
    });

    expect(
      createFailedProgressUpdate(
        local,
        new Error('Failed with api_key=token-123'),
        '2026-06-29T00:00:01.000Z'
      )
    ).toEqual({
      ...local,
      serverStatus: 'failed',
      lastServerAttemptAt: '2026-06-29T00:00:01.000Z',
      retryCount: 1,
      errorMessage: 'Failed with api_key=[redacted]',
    });
  });

  it('bypasses ordinary progress throttling for final updates', () => {
    expect(
      shouldSyncPlaybackProgress({
        final: true,
        lastReportedAtMs: Date.parse('2026-06-29T00:00:00.000Z'),
        lastReportedPositionSeconds: 12,
        nowMs: Date.parse('2026-06-29T00:00:01.000Z'),
        positionSeconds: 13,
        reportIntervalMs: 5000,
      })
    ).toBe(true);

    expect(
      shouldSyncPlaybackProgress({
        final: false,
        lastReportedAtMs: Date.parse('2026-06-29T00:00:00.000Z'),
        lastReportedPositionSeconds: 12,
        nowMs: Date.parse('2026-06-29T00:00:01.000Z'),
        positionSeconds: 13,
        reportIntervalMs: 5000,
      })
    ).toBe(false);
  });
});
