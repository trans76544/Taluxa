import { describe, expect, it, vi } from 'vitest';
import {
  createEmptyPersistedState,
  type PersistedState,
} from '../../../shared/store/persistence';
import { writePersistedStatePatch } from './storage';

vi.mock('electron-store', () => ({
  default: class MockStore<T> {
    store: T;

    constructor(options: { defaults: T }) {
      this.store = options.defaults;
    }
  },
}));

describe('writePersistedStatePatch', () => {
  it('emits a saved settings sync event after persisting a settings patch', async () => {
    const storeLike = { store: createEmptyPersistedState() };
    const onSettingsSync = vi.fn();

    await writePersistedStatePatch(
      storeLike,
      {
        settings: {
          playback: {
            scaleMode: 'stretch',
          },
        },
      },
      {
        settingsSyncOrigin: 'player',
        onSettingsSync,
      }
    );

    expect(onSettingsSync).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: 'player',
        patch: {
          playback: {
            scaleMode: 'stretch',
          },
        },
        status: 'saved',
      })
    );
    expect((storeLike.store as PersistedState).settings.playback.scaleMode).toBe('stretch');
  });

  it('emits a failed settings sync event when settings side effects reject', async () => {
    const storeLike = { store: createEmptyPersistedState() };
    const onSettingsSync = vi.fn();

    await expect(
      writePersistedStatePatch(
        storeLike,
        {
          settings: {
            subtitles: {
              fontSize: 72,
            },
          },
        },
        {
          onSettingsChanged: async () => {
            throw new Error('proxy token=secret');
          },
          onSettingsSync,
          settingsSyncOrigin: 'player',
        }
      )
    ).rejects.toThrow('proxy token=secret');

    expect(onSettingsSync).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: 'player',
        patch: {
          subtitles: {
            fontSize: 72,
          },
        },
        status: 'failed',
      })
    );
    expect(onSettingsSync.mock.calls[0][0].errorMessage).toContain('token=[redacted]');
  });
});
