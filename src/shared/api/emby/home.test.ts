import { describe, expect, it } from 'vitest';
import {
  buildHomeLibraryCards,
  buildServerContinueWatchingItems,
  buildContinueWatchingItems,
  buildHomeRefreshStatusMessage,
  dedupeContinueWatchingPosterItems,
  pickFeaturedViews,
} from './home';

describe('home helpers', () => {
  it('builds library cards with artwork from multiple preview items', () => {
    expect(
      buildHomeLibraryCards({
        views: [{ id: 'shows', name: 'Shows', collectionType: 'tvshows' }],
        previewItemsByViewId: new Map([
          [
            'shows',
            [
              {
                id: 'episode-1',
                name: 'Episode 1',
                posterUrl: 'https://demo.local/episode-1.jpg',
                imageCandidates: [
                  {
                    url: 'https://demo.local/episode-1.jpg',
                    kind: 'primary',
                  },
                ],
                runtimeTicks: null,
                serverPositionTicks: null,
                communityRating: null,
                productionYear: 2026,
                type: 'Episode',
              },
              {
                id: 'movie-1',
                name: 'Movie 1',
                posterUrl: 'https://demo.local/movie-1.jpg',
                imageCandidates: [
                  {
                    url: 'https://demo.local/movie-1.jpg',
                    kind: 'primary',
                  },
                ],
                runtimeTicks: null,
                serverPositionTicks: null,
                communityRating: null,
                productionYear: 2026,
                type: 'Movie',
              },
              {
                id: 'movie-2',
                name: 'Movie 2',
                posterUrl: 'https://demo.local/movie-2.jpg',
                imageCandidates: [
                  {
                    url: 'https://demo.local/movie-2.jpg',
                    kind: 'primary',
                  },
                ],
                runtimeTicks: null,
                serverPositionTicks: null,
                communityRating: null,
                productionYear: 2026,
                type: 'Movie',
              },
            ],
          ],
        ]),
      })
    ).toEqual([
      {
        id: 'shows',
        title: 'Shows',
        posterUrl: 'https://demo.local/episode-1.jpg',
        imageCandidates: [
          {
            url: 'https://demo.local/episode-1.jpg',
            kind: 'primary',
          },
          {
            url: 'https://demo.local/movie-1.jpg',
            kind: 'primary',
          },
          {
            url: 'https://demo.local/movie-2.jpg',
            kind: 'primary',
          },
        ],
        href: '/libraries/shows',
        state: {
          libraryName: 'Shows',
        },
      },
    ]);
  });

  it('builds continue watching from server resume items only', () => {
    expect(
      buildServerContinueWatchingItems({
        serverItems: [
          {
            id: 'server-movie',
            name: 'Server Movie',
            posterUrl: 'https://demo.local/server-movie.jpg',
            imageCandidates: [],
            runtimeTicks: 20000000000,
            serverPositionTicks: 5000000000,
            communityRating: null,
            productionYear: 2026,
            type: 'Movie',
          },
        ],
      }).map((item) => ({
        id: item.id,
        title: item.title,
        progressPercent: item.progressPercent,
      }))
    ).toEqual([
      {
        id: 'server-movie',
        title: 'Server Movie',
        progressPercent: 25,
      },
    ]);
  });

  it('preserves lightweight server resume fields needed for fast home and detail rendering', () => {
    expect(
      buildServerContinueWatchingItems({
        serverItems: [
          {
            id: 'episode-7',
            name: 'Fast Resume',
            type: 'Episode',
            seriesId: 'series-1',
            seriesName: 'Series 1',
            parentId: 'season-2',
            parentIndexNumber: 2,
            indexNumber: 7,
            posterUrl: 'https://demo.local/episode-7-primary.jpg',
            imageCandidates: [
              {
                url: 'https://demo.local/episode-7-primary.jpg',
                kind: 'primary',
              },
              {
                url: 'https://demo.local/series-1-thumb.jpg',
                kind: 'parent-thumb',
              },
            ],
            runtimeTicks: 18000000000,
            serverPositionTicks: 9000000000,
            lastPlayedAt: '2026-04-22T08:00:00.000Z',
            communityRating: null,
            productionYear: null,
          },
        ],
      })
    ).toEqual([
      {
        id: 'episode-7',
        title: 'Series 1',
        subtitle: 'S2E7 - Fast Resume',
        posterUrl: 'https://demo.local/episode-7-primary.jpg',
        imageCandidates: [
          {
            url: 'https://demo.local/episode-7-primary.jpg',
            kind: 'primary',
          },
          {
            url: 'https://demo.local/series-1-thumb.jpg',
            kind: 'parent-thumb',
          },
        ],
        href: '/item/series-1',
        progressPercent: 50,
        state: {
          title: 'Series 1',
          serverPositionTicks: 9000000000,
          resumeEpisodeId: 'episode-7',
          resumeSeasonId: 'season-2',
          resumeSeasonIndex: 2,
        },
      },
    ]);
  });

  it('sorts server resume items from most recently watched to earliest', () => {
    expect(
      buildServerContinueWatchingItems({
        serverItems: [
          {
            id: 'older-movie',
            name: 'Older Movie',
            posterUrl: 'https://demo.local/older-movie.jpg',
            imageCandidates: [],
            runtimeTicks: 20000000000,
            serverPositionTicks: 5000000000,
            lastPlayedAt: '2026-04-21T08:00:00.000Z',
            communityRating: null,
            productionYear: 2026,
            type: 'Movie',
          },
          {
            id: 'newer-movie',
            name: 'Newer Movie',
            posterUrl: 'https://demo.local/newer-movie.jpg',
            imageCandidates: [],
            runtimeTicks: 20000000000,
            serverPositionTicks: 5000000000,
            lastPlayedAt: '2026-04-22T08:00:00.000Z',
            communityRating: null,
            productionYear: 2026,
            type: 'Movie',
          },
        ],
      }).map((item) => item.id)
    ).toEqual(['newer-movie', 'older-movie']);
  });

  it('does not cap server continue watching items at eight cards', () => {
    expect(
      buildServerContinueWatchingItems({
        serverItems: Array.from({ length: 9 }, (_, index) => ({
          id: `server-movie-${index + 1}`,
          name: `Server Movie ${index + 1}`,
          posterUrl: `https://demo.local/server-movie-${index + 1}.jpg`,
          imageCandidates: [],
          runtimeTicks: 20000000000,
          serverPositionTicks: 5000000000,
          lastPlayedAt: `2026-04-${String(22 - index).padStart(2, '0')}T08:00:00.000Z`,
          communityRating: null,
          productionYear: 2026,
          type: 'Movie',
        })),
      })
    ).toHaveLength(9);
  });

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

  it('does not cap local continue watching items at eight cards', () => {
    const progressByItemId = Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => [
        `item-${index + 1}`,
        {
          itemId: `item-${index + 1}`,
          positionSeconds: 120,
          durationSeconds: 1800,
          updatedAt: `2026-04-${String(22 - index).padStart(2, '0')}T10:00:00.000Z`,
        },
      ])
    );
    const itemsById = Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => [
        `item-${index + 1}`,
        {
          id: `item-${index + 1}`,
          name: `Movie ${index + 1}`,
          posterUrl: `https://demo.local/poster-${index + 1}.jpg`,
          imageCandidates: [],
          runtimeTicks: 18000000000,
          serverPositionTicks: 1200000000,
          communityRating: null,
          productionYear: 2026,
          type: 'Movie',
        },
      ])
    );

    expect(
      buildContinueWatchingItems({
        progressByItemId,
        itemsById,
      })
    ).toHaveLength(9);
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

  it('keeps only the latest played episode for the same series', () => {
    expect(
      buildContinueWatchingItems({
        progressByItemId: {
          'episode-1': {
            itemId: 'episode-1',
            positionSeconds: 120,
            durationSeconds: 1800,
            updatedAt: '2026-04-22T09:00:00.000Z',
          },
          'episode-12': {
            itemId: 'episode-12',
            positionSeconds: 60,
            durationSeconds: 1500,
            updatedAt: '2026-04-22T11:00:00.000Z',
          },
          'movie-1': {
            itemId: 'movie-1',
            positionSeconds: 300,
            durationSeconds: 3000,
            updatedAt: '2026-04-22T10:00:00.000Z',
          },
        },
        itemsById: {
          'episode-1': {
            id: 'episode-1',
            name: 'First Episode',
            posterUrl: 'https://demo.local/episode-1.jpg',
            imageCandidates: [],
            runtimeTicks: 18000000000,
            serverPositionTicks: 1200000000,
            communityRating: null,
            productionYear: null,
            type: 'Episode',
            seriesId: 'series-1',
            seriesName: 'Series A',
            parentId: 'season-1',
            parentIndexNumber: 1,
            indexNumber: 1,
          },
          'episode-12': {
            id: 'episode-12',
            name: 'Latest Episode',
            posterUrl: 'https://demo.local/episode-12.jpg',
            imageCandidates: [],
            runtimeTicks: 15000000000,
            serverPositionTicks: 600000000,
            communityRating: null,
            productionYear: null,
            type: 'Episode',
            seriesId: 'series-1',
            seriesName: 'Series A',
            parentId: 'season-1',
            parentIndexNumber: 1,
            indexNumber: 12,
          },
          'movie-1': {
            id: 'movie-1',
            name: 'Movie 1',
            posterUrl: 'https://demo.local/movie-1.jpg',
            imageCandidates: [],
            runtimeTicks: 30000000000,
            serverPositionTicks: 3000000000,
            communityRating: null,
            productionYear: 2026,
            type: 'Movie',
          },
        },
      }).map((item) => ({
        id: item.id,
        title: item.title,
        subtitle: item.subtitle,
      }))
    ).toEqual([
      {
        id: 'episode-12',
        title: 'Series A',
        subtitle: 'S1E12 - Latest Episode',
      },
      {
        id: 'movie-1',
        title: 'Movie 1',
        subtitle: '2026',
      },
    ]);
  });

  it('dedupes cached continue watching episode cards for the same series details href', () => {
    expect(
      dedupeContinueWatchingPosterItems([
        {
          id: 'episode-2',
          title: 'Series A',
          subtitle: 'S1E2 - Latest Episode',
          posterUrl: 'https://demo.local/episode-2.jpg',
          imageCandidates: [],
          href: '/item/series-1',
          progressPercent: 8,
          state: {
            title: 'Series A',
            resumeEpisodeId: 'episode-2',
            resumeSeasonId: 'season-1',
          },
        },
        {
          id: 'episode-1',
          title: 'Series A',
          subtitle: 'S1E1 - Earlier Episode',
          posterUrl: 'https://demo.local/episode-1.jpg',
          imageCandidates: [],
          href: '/item/series-1',
          progressPercent: 4,
          state: {
            title: 'Series A',
            resumeEpisodeId: 'episode-1',
            resumeSeasonId: 'season-1',
          },
        },
        {
          id: 'movie-1',
          title: 'Movie 1',
          subtitle: '2026',
          posterUrl: 'https://demo.local/movie-1.jpg',
          imageCandidates: [],
          href: '/item/movie-1',
        },
      ]).map((item) => item.id)
    ).toEqual(['episode-2', 'movie-1']);
  });

  it('builds a non-blocking status message for failed home sections', () => {
    expect(
      buildHomeRefreshStatusMessage([
        {
          sectionId: 'preview:shows',
          title: 'Shows',
          message: 'request timed out',
        },
      ])
    ).toBe('Some home sections could not refresh: Shows.');
  });
});
