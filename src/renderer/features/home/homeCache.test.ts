import { describe, expect, it } from 'vitest';
import type { HomeLibraryCard, HomePosterItem, HomePosterRow } from '@shared/api/emby/home';
import { createHomeCacheEntry, createHomeCacheKey, isHomeCacheFresh } from './homeCache';

describe('home cache helpers', () => {
  it('creates a stable account and sort scoped cache key', () => {
    expect(createHomeCacheKey('account-1', 'latest_added')).toBe(
      'home-cache::account-1::latest_added'
    );
  });

  it('treats entries cached within the configured ttl as fresh', () => {
    expect(
      isHomeCacheFresh(
        '2026-05-02T00:00:00.000Z',
        Date.parse('2026-05-31T23:59:59.000Z'),
        30
      )
    ).toBe(true);
    expect(
      isHomeCacheFresh(
        '2026-05-02T00:00:00.000Z',
        Date.parse('2026-06-01T00:00:00.000Z'),
        30
      )
    ).toBe(true);
  });

  it('treats stale, invalid, and future entries as not fresh', () => {
    expect(
      isHomeCacheFresh(
        '2026-05-02T00:00:00.000Z',
        Date.parse('2026-06-01T00:00:01.000Z'),
        30
      )
    ).toBe(false);
    expect(isHomeCacheFresh('not-a-date', Date.parse('2026-05-02T00:00:00.000Z'))).toBe(false);
    expect(
      isHomeCacheFresh(
        '2026-05-02T00:01:00.000Z',
        Date.parse('2026-05-02T00:00:00.000Z'),
        30
      )
    ).toBe(false);
  });

  it('uses the configured data cache ttl when checking freshness', () => {
    const cachedAt = '2026-05-01T00:00:00.000Z';
    const now = Date.parse('2026-05-03T00:00:00.000Z');

    expect(isHomeCacheFresh(cachedAt, now, 1)).toBe(false);
    expect(isHomeCacheFresh(cachedAt, now, 7)).toBe(true);
    expect(isHomeCacheFresh(cachedAt, now, null)).toBe(true);
  });

  it('builds a persisted home cache entry from the home screen data shape', () => {
    const continueWatching: HomePosterItem[] = [
      {
        id: 'item-1',
        title: 'Movie 1',
        subtitle: 'Resume from 12 min',
        posterUrl: 'https://demo.local/poster-1.jpg',
        imageCandidates: [],
        href: '/player/item-1',
        state: {
          title: 'Movie 1',
          serverPositionTicks: 1200000000,
        },
      },
    ];
    const libraries: HomeLibraryCard[] = [
      {
        id: 'library-1',
        title: 'Movies',
        posterUrl: 'https://demo.local/library-1.jpg',
        imageCandidates: [],
        href: '/libraries/library-1',
      },
    ];
    const featuredRows: HomePosterRow[] = [
      {
        id: 'row-1',
        title: 'Featured Movies',
        href: '/libraries/library-1',
        items: [],
      },
    ];

    expect(
      createHomeCacheEntry({
        accountLabel: 'Server / Alice',
        continueWatching,
        libraries,
        featuredRows,
        now: Date.parse('2026-05-02T00:00:00.000Z'),
      })
    ).toEqual({
      cachedAt: '2026-05-02T00:00:00.000Z',
      accountLabel: 'Server / Alice',
      continueWatching,
      libraries,
      featuredRows,
    });
  });
});
