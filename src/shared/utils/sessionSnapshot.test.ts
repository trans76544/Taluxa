import { describe, expect, it } from 'vitest';
import {
  createSessionSnapshotStore,
  createSessionSnapshotKey,
} from './sessionSnapshot';

describe('session snapshots', () => {
  it('stores and retrieves snapshots only for exact account-scoped keys', () => {
    const store = createSessionSnapshotStore<string>({ maxEntries: 2, now: () => 10 });
    const key = createSessionSnapshotKey({
      accountId: 'account-1',
      parts: ['home', 'latest_added'],
    });

    store.set(key, 'cached-home');

    expect(store.get(key)).toBe('cached-home');
    expect(
      store.get(
        createSessionSnapshotKey({
          accountId: 'account-2',
          parts: ['home', 'latest_added'],
        })
      )
    ).toBeUndefined();
  });

  it('prunes the least recently used entry when bounded capacity is exceeded', () => {
    let now = 0;
    const store = createSessionSnapshotStore<string>({ maxEntries: 2, now: () => now });
    const first = createSessionSnapshotKey({ accountId: 'a', parts: ['item', '1'] });
    const second = createSessionSnapshotKey({ accountId: 'a', parts: ['item', '2'] });
    const third = createSessionSnapshotKey({ accountId: 'a', parts: ['item', '3'] });

    store.set(first, 'one');
    now = 1;
    store.set(second, 'two');
    now = 2;
    expect(store.get(first)).toBe('one');
    now = 3;
    store.set(third, 'three');

    expect(store.get(first)).toBe('one');
    expect(store.get(second)).toBeUndefined();
    expect(store.get(third)).toBe('three');
  });

  it('invalidates snapshots by predicate', () => {
    const store = createSessionSnapshotStore<string>();
    const homeKey = createSessionSnapshotKey({ accountId: 'a', parts: ['home'] });
    const itemKey = createSessionSnapshotKey({ accountId: 'a', parts: ['item', '1'] });

    store.set(homeKey, 'home');
    store.set(itemKey, 'item');
    store.invalidate((key) => key.includes('item'));

    expect(store.get(homeKey)).toBe('home');
    expect(store.get(itemKey)).toBeUndefined();
  });

  it('keeps account, item, sort mode, and selected season keys isolated', () => {
    const latestHome = createSessionSnapshotKey({
      accountId: 'account-1',
      parts: ['home', 'latest_added'],
    });
    const alphabeticalHome = createSessionSnapshotKey({
      accountId: 'account-1',
      parts: ['home', 'alphabetical'],
    });
    const otherAccountHome = createSessionSnapshotKey({
      accountId: 'account-2',
      parts: ['home', 'latest_added'],
    });
    const firstSeasonDetail = createSessionSnapshotKey({
      accountId: 'account-1',
      parts: ['detail', 'series-1', 'season-1'],
    });
    const secondSeasonDetail = createSessionSnapshotKey({
      accountId: 'account-1',
      parts: ['detail', 'series-1', 'season-2'],
    });

    expect(
      new Set([
        latestHome,
        alphabeticalHome,
        otherAccountHome,
        firstSeasonDetail,
        secondSeasonDetail,
      ]).size
    ).toBe(5);
  });
});
