import { describe, expect, it } from 'vitest';
import { createLoadTimingRecorder } from './loadTiming';

describe('createLoadTimingRecorder', () => {
  it('records elapsed timing milestones with an injected clock', () => {
    let now = 1000;
    const recorder = createLoadTimingRecorder({
      attemptId: 7,
      surface: 'home',
      now: () => now,
    });

    now = 1250;
    const first = recorder.mark('home-primary-visible');
    now = 1750;
    const second = recorder.mark('home-refresh-complete', 'partial');

    expect(first).toEqual({
      attemptId: 7,
      elapsedMs: 250,
      name: 'home-primary-visible',
      result: 'success',
      surface: 'home',
    });
    expect(second.elapsedMs).toBe(750);
    expect(second.result).toBe('partial');
    expect(recorder.milestones).toEqual([first, second]);
  });
});
