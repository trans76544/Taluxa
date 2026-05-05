import { describe, expect, it } from 'vitest';
import { buildContinueWatchingItems, pickFeaturedViews } from './home';

describe('home helpers', () => {
  it('builds continue watching items from the newest saved progress first and shows movie years', () => {
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
            imageCandidates: [
              {
                url: 'https://demo.local/poster-1.jpg',
                kind: 'primary',
              },
              {
                url: 'https://demo.local/thumb-1.jpg',
                kind: 'thumb',
              },
            ],
            runtimeTicks: 18000000000,
            serverPositionTicks: 1200000000,
            communityRating: 9.0,
            productionYear: 2026,
            type: 'Movie',
          },
          'item-2': {
            id: 'item-2',
            name: 'Movie 2',
            posterUrl: 'https://demo.local/poster-2.jpg',
            imageCandidates: [
              {
                url: 'https://demo.local/poster-2.jpg',
                kind: 'primary',
              },
            ],
            runtimeTicks: 15000000000,
            serverPositionTicks: 600000000,
            communityRating: null,
            productionYear: null,
            type: 'Movie',
          },
        },
      })
    ).toEqual([
      {
        id: 'item-1',
        title: 'Movie 1',
        subtitle: '2026',
        posterUrl: 'https://demo.local/poster-1.jpg',
        imageCandidates: [
          {
            url: 'https://demo.local/poster-1.jpg',
            kind: 'primary',
          },
          {
            url: 'https://demo.local/thumb-1.jpg',
            kind: 'thumb',
          },
        ],
        href: '/item/item-1',
        progressPercent: 6.666666666666667,
        state: {
          title: 'Movie 1',
          serverPositionTicks: 1200000000,
        },
      },
      {
        id: 'item-2',
        title: 'Movie 2',
        subtitle: '',
        posterUrl: 'https://demo.local/poster-2.jpg',
        imageCandidates: [
          {
            url: 'https://demo.local/poster-2.jpg',
            kind: 'primary',
          },
        ],
        href: '/item/item-2',
        progressPercent: 4,
        state: {
          title: 'Movie 2',
          serverPositionTicks: 600000000,
        },
      },
    ]);
  });

  it('picks every featured library view in order', () => {
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
      { id: 'docs', name: 'Docs', collectionType: 'movies' },
    ]);
  });

  it('builds episode resume cards that open the parent series and select the episode', () => {
    expect(
      buildContinueWatchingItems({
        progressByItemId: {
          'episode-14': {
            itemId: 'episode-14',
            positionSeconds: 120,
            durationSeconds: 1800,
            updatedAt: '2026-04-22T10:00:00.000Z',
          },
        },
        itemsById: {
          'episode-14': {
            id: 'episode-14',
            name: '尘都无法忘记',
            posterUrl: 'https://demo.local/episode-14.jpg',
            imageCandidates: [
              {
                url: 'https://demo.local/episode-14.jpg',
                kind: 'primary',
              },
            ],
            runtimeTicks: 18000000000,
            serverPositionTicks: 1200000000,
            communityRating: null,
            productionYear: 2026,
            type: 'Episode',
            seriesId: 'series-1',
            seriesName: '一人之下',
            parentId: 'season-6',
            parentIndexNumber: 6,
            indexNumber: 14,
          },
        },
      })
    ).toEqual([
      {
        id: 'episode-14',
        title: '一人之下',
        subtitle: 'S6E14 - 尘都无法忘记',
        posterUrl: 'https://demo.local/episode-14.jpg',
        imageCandidates: [
          {
            url: 'https://demo.local/episode-14.jpg',
            kind: 'primary',
          },
        ],
        href: '/item/series-1',
        progressPercent: 6.666666666666667,
        state: {
          title: '一人之下',
          serverPositionTicks: 1200000000,
          resumeEpisodeId: 'episode-14',
          resumeSeasonId: 'season-6',
          resumeSeasonIndex: 6,
        },
      },
    ]);
  });
});
