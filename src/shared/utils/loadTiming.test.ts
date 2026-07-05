import { describe, expect, it } from 'vitest';
import { createLoadTimingRecorder, getTimingSegments } from './loadTiming';

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

  it('computes named critical path segments from ordered milestones', () => {
    const segments = getTimingSegments(
      [
        {
          attemptId: 1,
          elapsedMs: 0,
          name: 'play-acknowledged',
          result: 'success',
          surface: 'playback',
        },
        {
          attemptId: 1,
          elapsedMs: 80,
          name: 'playback-source-ready',
          result: 'success',
          surface: 'playback',
        },
        {
          attemptId: 1,
          elapsedMs: 120,
          name: 'player-launch-requested',
          result: 'success',
          surface: 'playback',
        },
        {
          attemptId: 1,
          elapsedMs: 620,
          name: 'playback-ready',
          result: 'success',
          surface: 'playback',
        },
      ],
      [
        {
          name: 'source-resolution',
          from: 'play-acknowledged',
          to: 'playback-source-ready',
          avoidable: true,
        },
        {
          name: 'pre-launch',
          from: 'playback-source-ready',
          to: 'player-launch-requested',
          avoidable: true,
        },
        {
          name: 'player-readiness',
          from: 'player-launch-requested',
          to: 'playback-ready',
          avoidable: false,
        },
      ]
    );

    expect(segments).toEqual([
      {
        avoidable: true,
        durationMs: 80,
        endMilestone: 'playback-source-ready',
        name: 'source-resolution',
        startMilestone: 'play-acknowledged',
      },
      {
        avoidable: true,
        durationMs: 40,
        endMilestone: 'player-launch-requested',
        name: 'pre-launch',
        startMilestone: 'playback-source-ready',
      },
      {
        avoidable: false,
        durationMs: 500,
        endMilestone: 'playback-ready',
        name: 'player-readiness',
        startMilestone: 'player-launch-requested',
      },
    ]);
  });
});
