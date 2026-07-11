import { describe, expect, it } from 'vitest';
import { isPlayerPlaybackEvent } from './playback';

describe('player playback event contract', () => {
  it('accepts normalized lifecycle events', () => {
    expect(isPlayerPlaybackEvent({
      playbackId: '1:1', sequence: 1, phase: 'started', itemId: 'item-1',
      positionSeconds: 0, durationSeconds: 180,
    })).toBe(true);
    expect(isPlayerPlaybackEvent({
      playbackId: '1:1', sequence: 2, phase: 'stopped', itemId: 'item-1',
      positionSeconds: 42, durationSeconds: 180, reason: 'quit', completed: false,
    })).toBe(true);
  });

  it('rejects malformed or negative lifecycle events', () => {
    expect(isPlayerPlaybackEvent({ phase: 'progress', itemId: 'item-1' })).toBe(false);
    expect(isPlayerPlaybackEvent({
      playbackId: '1:1', sequence: -1, phase: 'progress', itemId: 'item-1',
      positionSeconds: 1, durationSeconds: 180,
    })).toBe(false);
  });
});
