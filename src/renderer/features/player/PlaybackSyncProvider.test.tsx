import { act, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@renderer/features/auth/AuthContext';
import { createAccountScopedProgressKey, createEmptyPersistedState, mergePersistedState } from '@shared/store/persistence';
import { reportPlaybackProgress, reportPlaybackStarted, reportPlaybackStopped } from '@shared/api/emby/playback';
import { PlaybackSyncProvider, usePlaybackSync } from './PlaybackSyncProvider';

vi.mock('@shared/api/emby/playback', () => ({
  reportPlaybackStarted: vi.fn(),
  reportPlaybackProgress: vi.fn(),
  reportPlaybackStopped: vi.fn(),
}));

const account = {
  id: 'https://demo.local::user-1', serverUrl: 'https://demo.local', userId: 'user-1',
  userName: 'User', accessToken: 'token', lastUsedAt: '2026-07-11T00:00:00.000Z',
};

function RegisterContext() {
  const { registerPlaybackContext } = usePlaybackSync();
  useEffect(() => {
    registerPlaybackContext({
      accountId: account.id, serverUrl: account.serverUrl, userId: account.userId,
      accessToken: account.accessToken, itemId: 'item-1', playSessionId: null,
      mediaSourceId: 'source-1', playMethod: 'DirectPlay', audioStreamIndex: null,
      resumeItem: { itemId: 'item-1', itemType: 'Movie', title: 'Movie', posterUrl: '', imageCandidates: [] },
    });
  }, [registerPlaybackContext]);
  return null;
}

describe('PlaybackSyncProvider', () => {
  beforeEach(() => vi.clearAllMocks());

  it('owns one player-event subscription and forwards events to the coordinator', async () => {
    let listener: ((event: Parameters<NonNullable<typeof window.embyDesktop.player.onPlaybackEvent>>[0] extends (event: infer T) => void ? T : never) => void) | undefined;
    const unsubscribe = vi.fn();
    const state = createEmptyPersistedState();
    window.embyDesktop = {
      storage: { read: vi.fn().mockResolvedValue(state), write: vi.fn().mockResolvedValue(state) },
      player: { onPlaybackEvent: vi.fn((next) => { listener = next; return unsubscribe; }) },
    } as unknown as typeof window.embyDesktop;
    const view = render(
      <AuthProvider initialState={{ accounts: [], activeAccountId: null }} isHydrated>
        <PlaybackSyncProvider><RegisterContext /></PlaybackSyncProvider>
      </AuthProvider>,
    );
    await waitFor(() => expect(window.embyDesktop.player.onPlaybackEvent).toHaveBeenCalledTimes(1));

    await act(async () => listener?.({ playbackId: '1:1', sequence: 1, phase: 'started', itemId: 'item-1', positionSeconds: 0, durationSeconds: 180 }));

    await waitFor(() => expect(reportPlaybackStarted).toHaveBeenCalledTimes(1));
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('retries the latest failed account-scoped record after auth hydration', async () => {
    const progressKey = createAccountScopedProgressKey(account.id, 'item-1');
    let state = mergePersistedState({
      accounts: [account], activeAccountId: account.id,
      progressByItemId: { [progressKey]: {
        itemId: 'item-1', playbackId: 'old', sequence: 2, positionSeconds: 30,
        durationSeconds: 180, updatedAt: '2026-07-11T00:00:00.000Z',
        serverStatus: 'failed', retryCount: 1, pendingOperation: 'progress', completed: false,
      } },
    }, createEmptyPersistedState());
    window.embyDesktop = {
      storage: {
        read: vi.fn(async () => state),
        write: vi.fn(async (patch) => { state = mergePersistedState(patch, state); return state; }),
      },
      player: {},
    } as unknown as typeof window.embyDesktop;

    const view = render(
      <AuthProvider initialState={{ accounts: [account], activeAccountId: account.id }} isHydrated>
        <PlaybackSyncProvider><div>ready</div></PlaybackSyncProvider>
      </AuthProvider>,
    );

    await waitFor(() => expect(reportPlaybackStopped).toHaveBeenCalledTimes(1));
    expect(Object.values(state.progressByItemId)[0]).toEqual(expect.objectContaining({ serverStatus: 'confirmed' }));
    expect(reportPlaybackProgress).not.toHaveBeenCalled();

    state = mergePersistedState({ progressByItemId: { [progressKey]: {
      ...Object.values(state.progressByItemId)[0], sequence: 3, positionSeconds: 45,
      updatedAt: '2026-07-11T00:01:00.000Z', serverStatus: 'failed',
    } } }, state);
    act(() => window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(reportPlaybackStopped).toHaveBeenCalledTimes(2));

    view.unmount();
    act(() => window.dispatchEvent(new Event('online')));
    expect(reportPlaybackStopped).toHaveBeenCalledTimes(2);
  });
});
