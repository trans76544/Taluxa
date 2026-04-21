import { describe, expect, it } from 'vitest';
import { getResumePositionSeconds } from './playbackProgress';

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
