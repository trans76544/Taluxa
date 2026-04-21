import { describe, expect, it } from 'vitest';
import { createEmptyPersistedState, mergePersistedState } from './persistence';

describe('persistence', () => {
  it('creates empty persisted state with defaults', () => {
    expect(createEmptyPersistedState()).toEqual({
      serverUrl: '',
      session: null,
      settings: {
        rememberSession: true,
        defaultVolume: 1,
      },
      progressByItemId: {},
    });
  });

  it('merges persisted state with nested settings defaults', () => {
    expect(
      mergePersistedState({
        serverUrl: 'http://demo.local',
        settings: {
          defaultVolume: 0.4,
        },
      })
    ).toEqual({
      serverUrl: 'http://demo.local',
      session: null,
      settings: {
        rememberSession: true,
        defaultVolume: 0.4,
      },
      progressByItemId: {},
    });
  });
});
