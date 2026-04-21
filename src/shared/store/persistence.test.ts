import { describe, expect, it } from 'vitest';
import {
  createEmptyPersistedState,
  mergePersistedState,
  type PersistedState,
} from './persistence';

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

  it('preserves existing progress entries when merging a partial patch', () => {
    const currentState: PersistedState = {
      ...createEmptyPersistedState(),
      progressByItemId: {
        'item-a': {
          itemId: 'item-a',
          positionSeconds: 12,
          durationSeconds: 100,
          updatedAt: '2026-04-21T00:00:00.000Z',
        },
      },
    };

    expect(
      mergePersistedState(
        {
          progressByItemId: {
            'item-b': {
              itemId: 'item-b',
              positionSeconds: 30,
              durationSeconds: 200,
              updatedAt: '2026-04-21T01:00:00.000Z',
            },
          },
        },
        currentState
      )
    ).toEqual({
      serverUrl: '',
      session: null,
      settings: {
        rememberSession: true,
        defaultVolume: 1,
      },
      progressByItemId: {
        'item-a': {
          itemId: 'item-a',
          positionSeconds: 12,
          durationSeconds: 100,
          updatedAt: '2026-04-21T00:00:00.000Z',
        },
        'item-b': {
          itemId: 'item-b',
          positionSeconds: 30,
          durationSeconds: 200,
          updatedAt: '2026-04-21T01:00:00.000Z',
        },
      },
    });
  });
});
