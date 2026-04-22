import { describe, expect, it } from 'vitest';
import { buildContinueWatchingItems, pickFeaturedViews } from './home';

describe('home helpers', () => {
  it('builds continue watching items from the newest saved progress first', () => {
    expect(
      buildContinueWatchingItems({
        progressByItemId: {
          'item-1': {
            itemId: 'item-1',
            positionSeconds: 120,
            durationSeconds: 1800,
            updatedAt: '2026-04-22T10:00:00.000Z',
          },
          'item-2': {
            itemId: 'item-2',
            positionSeconds: 60,
            durationSeconds: 1500,
            updatedAt: '2026-04-22T09:00:00.000Z',
          },
        },
        itemsById: {
          'item-1': {
            id: 'item-1',
            name: 'Movie 1',
            posterUrl: 'https://demo.local/poster-1.jpg',
            runtimeTicks: 18000000000,
            serverPositionTicks: 1200000000,
          },
          'item-2': {
            id: 'item-2',
            name: 'Movie 2',
            posterUrl: 'https://demo.local/poster-2.jpg',
            runtimeTicks: 15000000000,
            serverPositionTicks: 600000000,
          },
        },
      })
    ).toEqual([
      {
        id: 'item-1',
        title: 'Movie 1',
        subtitle: 'Continue watching',
        posterUrl: 'https://demo.local/poster-1.jpg',
        href: '/player/item-1',
        state: {
          title: 'Movie 1',
          serverPositionTicks: 1200000000,
        },
      },
      {
        id: 'item-2',
        title: 'Movie 2',
        subtitle: 'Continue watching',
        posterUrl: 'https://demo.local/poster-2.jpg',
        href: '/player/item-2',
        state: {
          title: 'Movie 2',
          serverPositionTicks: 600000000,
        },
      },
    ]);
  });

  it('picks the first three featured library views', () => {
    expect(
      pickFeaturedViews([
        { id: 'movies', name: 'Movies', collectionType: 'movies' },
        { id: 'shows', name: 'Shows', collectionType: 'tvshows' },
        { id: 'anime', name: 'Anime', collectionType: 'movies' },
        { id: 'docs', name: 'Docs', collectionType: 'movies' },
      ])
    ).toEqual([
      { id: 'movies', name: 'Movies', collectionType: 'movies' },
      { id: 'shows', name: 'Shows', collectionType: 'tvshows' },
      { id: 'anime', name: 'Anime', collectionType: 'movies' },
    ]);
  });
});
