import { describe, expect, it, vi } from 'vitest';
import { createAccountScopedProgressKey, createEmptyPersistedState, mergePersistedState } from '@shared/store/persistence';
import { PlaybackSyncCoordinator, type PlaybackReportContext } from './playbackSync';

function context(): PlaybackReportContext {
  return {
    accountId: 'https://demo.local::user-1', serverUrl: 'https://demo.local',
    userId: 'user-1', accessToken: 'token', itemId: 'item-1', playMethod: 'DirectPlay',
    playSessionId: null, mediaSourceId: 'source-1', audioStreamIndex: null,
    resumeItem: { itemId: 'item-1', itemType: 'Movie', title: 'Movie', posterUrl: '', imageCandidates: [] },
  };
}

describe('PlaybackSyncCoordinator', () => {
  it('ignores progress before a started lifecycle event', async () => {
    let state = createEmptyPersistedState();
    const reportProgress = vi.fn();
    const coordinator = new PlaybackSyncCoordinator({
      readState: async () => state,
      writeState: async (patch) => { state = mergePersistedState(patch, state); return state; },
      reportStarted: vi.fn(), reportProgress, reportStopped: vi.fn(),
    });
    coordinator.registerContext(context());
    await coordinator.handleEvent({ playbackId: '1:1', sequence: 2, phase: 'progress', itemId: 'item-1', positionSeconds: 12, durationSeconds: 180 });
    expect(state.progressByItemId).toEqual({});
    expect(reportProgress).not.toHaveBeenCalled();
  });

  it('closes a zero-position started session remotely without creating resume history', async () => {
    let state = createEmptyPersistedState();
    const reportStopped = vi.fn();
    const coordinator = new PlaybackSyncCoordinator({
      readState: async () => state,
      writeState: async (patch) => { state = mergePersistedState(patch, state); return state; },
      reportStarted: vi.fn(), reportProgress: vi.fn(), reportStopped,
    });
    coordinator.registerContext(context());
    await coordinator.handleEvent({ playbackId: '1:1', sequence: 1, phase: 'started', itemId: 'item-1', positionSeconds: 0, durationSeconds: 180 });
    await coordinator.handleEvent({ playbackId: '1:1', sequence: 2, phase: 'stopped', itemId: 'item-1', positionSeconds: 0, durationSeconds: 180, reason: 'stop', completed: false });
    expect(reportStopped).toHaveBeenCalledTimes(1);
    expect(state.progressByItemId).toEqual({});
  });

  it('rejects every event after the first terminal event for a playback identity', async () => {
    let state = createEmptyPersistedState();
    const reportStopped = vi.fn();
    const coordinator = new PlaybackSyncCoordinator({
      readState: async () => state,
      writeState: async (patch) => { state = mergePersistedState(patch, state); return state; },
      reportStarted: vi.fn(), reportProgress: vi.fn(), reportStopped,
    });
    coordinator.registerContext(context());
    await coordinator.handleEvent({ playbackId: '1:1', sequence: 1, phase: 'started', itemId: 'item-1', positionSeconds: 0, durationSeconds: 180 });
    await coordinator.handleEvent({ playbackId: '1:1', sequence: 2, phase: 'stopped', itemId: 'item-1', positionSeconds: 40, durationSeconds: 180, reason: 'stop', completed: false });
    await coordinator.handleEvent({ playbackId: '1:1', sequence: 3, phase: 'stopped', itemId: 'item-1', positionSeconds: 20, durationSeconds: 180, reason: 'quit', completed: false });
    expect(reportStopped).toHaveBeenCalledTimes(1);
    expect(Object.values(state.progressByItemId)[0]).toEqual(expect.objectContaining({ positionSeconds: 40, sequence: 2 }));
  });

  it('persists newer local progress even while routine remote reporting is throttled', async () => {
    let state = createEmptyPersistedState();
    let nowMs = Date.parse('2026-07-11T00:00:00.000Z');
    const reportProgress = vi.fn().mockResolvedValue(undefined);
    const coordinator = new PlaybackSyncCoordinator({
      readState: async () => state,
      writeState: async (patch) => { state = mergePersistedState(patch, state); return state; },
      reportStarted: vi.fn(), reportProgress, reportStopped: vi.fn(), now: () => new Date(nowMs),
    });
    coordinator.registerContext(context());
    await coordinator.handleEvent({ playbackId: '1:1', sequence: 1, phase: 'started', itemId: 'item-1', positionSeconds: 0, durationSeconds: 180 });
    await coordinator.handleEvent({ playbackId: '1:1', sequence: 2, phase: 'progress', itemId: 'item-1', positionSeconds: 12, durationSeconds: 180 });
    nowMs += 5_000;
    await coordinator.handleEvent({ playbackId: '1:1', sequence: 3, phase: 'progress', itemId: 'item-1', positionSeconds: 24, durationSeconds: 180 });

    expect(reportProgress).toHaveBeenCalledTimes(1);
    expect(Object.values(state.progressByItemId)[0]).toEqual(expect.objectContaining({ positionSeconds: 24, sequence: 3, serverStatus: 'pending' }));
  });

  it('does not let an in-flight remote request block a newer local write', async () => {
    let state = createEmptyPersistedState();
    let releaseRemote!: () => void;
    const remotePending = new Promise<void>((resolve) => { releaseRemote = resolve; });
    const coordinator = new PlaybackSyncCoordinator({
      readState: async () => state,
      writeState: async (patch) => { state = mergePersistedState(patch, state); return state; },
      reportStarted: vi.fn(), reportProgress: vi.fn().mockReturnValue(remotePending), reportStopped: vi.fn(),
      now: () => new Date('2026-07-11T00:00:00.000Z'),
    });
    coordinator.registerContext(context());
    await coordinator.handleEvent({ playbackId: '1:1', sequence: 1, phase: 'started', itemId: 'item-1', positionSeconds: 0, durationSeconds: 180 });
    const first = coordinator.handleEvent({ playbackId: '1:1', sequence: 2, phase: 'progress', itemId: 'item-1', positionSeconds: 12, durationSeconds: 180 });
    await vi.waitFor(() => expect(Object.values(state.progressByItemId)[0]).toEqual(expect.objectContaining({ positionSeconds: 12 })));
    const second = coordinator.handleEvent({ playbackId: '1:1', sequence: 3, phase: 'progress', itemId: 'item-1', positionSeconds: 24, durationSeconds: 180 });

    await vi.waitFor(() => expect(Object.values(state.progressByItemId)[0]).toEqual(expect.objectContaining({ positionSeconds: 24 })));
    releaseRemote();
    await Promise.all([first, second]);
  });

  it('does not report progress until the remote start report succeeds', async () => {
    let state = createEmptyPersistedState();
    const reportProgress = vi.fn();
    const coordinator = new PlaybackSyncCoordinator({
      readState: async () => state,
      writeState: async (patch) => { state = mergePersistedState(patch, state); return state; },
      reportStarted: vi.fn().mockRejectedValue(new Error('start unavailable')),
      reportProgress, reportStopped: vi.fn(),
      now: () => new Date('2026-07-11T00:00:00.000Z'),
    });
    coordinator.registerContext(context());

    await coordinator.handleEvent({ playbackId: '1:1', sequence: 1, phase: 'started', itemId: 'item-1', positionSeconds: 0, durationSeconds: 180 });
    await coordinator.handleEvent({ playbackId: '1:1', sequence: 2, phase: 'progress', itemId: 'item-1', positionSeconds: 12, durationSeconds: 180 });

    expect(reportProgress).not.toHaveBeenCalled();
    expect(Object.values(state.progressByItemId)[0]).toEqual(expect.objectContaining({ serverStatus: 'failed', errorMessage: 'start unavailable' }));
  });

  it('bypasses throttling and reports completed stopped state', async () => {
    let state = createEmptyPersistedState();
    const reportStopped = vi.fn().mockResolvedValue(undefined);
    const coordinator = new PlaybackSyncCoordinator({
      readState: async () => state,
      writeState: async (patch) => { state = mergePersistedState(patch, state); return state; },
      reportStarted: vi.fn(), reportProgress: vi.fn(), reportStopped,
      now: () => new Date('2026-07-11T00:00:00.000Z'),
    });
    coordinator.registerContext(context());
    await coordinator.handleEvent({ playbackId: '1:1', sequence: 1, phase: 'started', itemId: 'item-1', positionSeconds: 0, durationSeconds: 180 });
    await coordinator.handleEvent({ playbackId: '1:1', sequence: 2, phase: 'progress', itemId: 'item-1', positionSeconds: 170, durationSeconds: 180 });
    await coordinator.handleEvent({ playbackId: '1:1', sequence: 3, phase: 'stopped', itemId: 'item-1', positionSeconds: 180, durationSeconds: 180, reason: 'eof', completed: true });
    expect(reportStopped).toHaveBeenCalledTimes(1);
    expect(Object.values(state.progressByItemId)[0]).toEqual(expect.objectContaining({ completed: true, pendingOperation: 'stopped', serverStatus: 'confirmed' }));
  });
  it('persists meaningful progress before ordered remote reporting', async () => {
    let state = mergePersistedState({ accounts: [{
      id: context().accountId, serverUrl: context().serverUrl, userId: 'user-1',
      userName: 'User', accessToken: 'token', lastUsedAt: '2026-07-11T00:00:00.000Z',
    }], activeAccountId: context().accountId }, createEmptyPersistedState());
    const calls: string[] = [];
    const coordinator = new PlaybackSyncCoordinator({
      readState: async () => state,
      writeState: async (patch) => { calls.push('local'); state = mergePersistedState(patch, state); return state; },
      reportStarted: async () => { calls.push('start'); },
      reportProgress: async () => { calls.push('progress'); },
      reportStopped: vi.fn(), now: () => new Date('2026-07-11T00:00:00.000Z'),
    });
    coordinator.registerContext(context());
    await coordinator.handleEvent({ playbackId: '1:1', sequence: 1, phase: 'started', itemId: 'item-1', positionSeconds: 0, durationSeconds: 180 });
    await coordinator.handleEvent({ playbackId: '1:1', sequence: 2, phase: 'progress', itemId: 'item-1', positionSeconds: 12, durationSeconds: 180 });
    expect(calls.slice(0, 3)).toEqual(['start', 'local', 'progress']);
    expect(Object.values(state.progressByItemId)[0]).toEqual(expect.objectContaining({ positionSeconds: 12, serverStatus: 'confirmed' }));
  });

  it('retains a redacted failed local update without rejecting playback', async () => {
    let state = createEmptyPersistedState();
    const coordinator = new PlaybackSyncCoordinator({
      readState: async () => state,
      writeState: async (patch) => { state = mergePersistedState(patch, state); return state; },
      reportStarted: vi.fn(), reportProgress: vi.fn().mockRejectedValue(new Error('api_key=secret')),
      reportStopped: vi.fn(), now: () => new Date('2026-07-11T00:00:00.000Z'),
    });
    coordinator.registerContext(context());
    await coordinator.handleEvent({ playbackId: '1:1', sequence: 1, phase: 'started', itemId: 'item-1', positionSeconds: 0, durationSeconds: 180 });
    await expect(coordinator.handleEvent({ playbackId: '1:1', sequence: 2, phase: 'progress', itemId: 'item-1', positionSeconds: 42, durationSeconds: 180 })).resolves.toBeUndefined();
    expect(Object.values(state.progressByItemId)[0]).toEqual(expect.objectContaining({ serverStatus: 'failed', errorMessage: 'api_key=[redacted]' }));
  });

  it('does not let a completed retry overwrite a newer playback revision', async () => {
    const account = {
      id: context().accountId, serverUrl: context().serverUrl, userId: 'user-1',
      userName: 'User', accessToken: 'token', lastUsedAt: '2026-07-11T00:00:00.000Z',
    };
    const progressKey = createAccountScopedProgressKey(account.id, 'item-1');
    let state = mergePersistedState({
      accounts: [account], activeAccountId: account.id,
      progressByItemId: { [progressKey]: {
        itemId: 'item-1', playbackId: 'old', sequence: 2, positionSeconds: 30,
        durationSeconds: 180, updatedAt: '2026-07-11T00:00:00.000Z',
        serverStatus: 'failed', retryCount: 1, pendingOperation: 'progress', completed: false,
      } },
    }, createEmptyPersistedState());
    const coordinator = new PlaybackSyncCoordinator({
      readState: async () => state,
      writeState: async (patch) => { state = mergePersistedState(patch, state); return state; },
      reportStarted: vi.fn(), reportProgress: vi.fn(),
      reportStopped: async () => {
        state = mergePersistedState({ progressByItemId: { [progressKey]: {
          itemId: 'item-1', playbackId: 'new', sequence: 7, positionSeconds: 80,
          durationSeconds: 180, updatedAt: '2026-07-11T00:01:00.000Z',
          serverStatus: 'pending', retryCount: 0, pendingOperation: 'progress', completed: false,
        } } }, state);
      },
      now: () => new Date('2026-07-11T00:02:00.000Z'),
    });

    await coordinator.retryPendingForAccount(account);

    expect(Object.values(state.progressByItemId)[0]).toEqual(expect.objectContaining({ playbackId: 'new', sequence: 7, positionSeconds: 80, serverStatus: 'pending' }));
  });
});
