import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchEpisodes,
  fetchItemDetails,
  fetchItems,
  fetchResumeItems,
  fetchResumableItems,
  fetchSearchItems,
  mapItemsResponse,
  mapViewsResponse,
} from './library';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('mapViewsResponse', () => {
  it('maps Emby library views into app models', () => {
    expect(
      mapViewsResponse({
        Items: [
          {
            Id: 'movies',
            Name: 'Movies',
            CollectionType: 'movies',
          },
        ],
      })
    ).toEqual([
      {
        id: 'movies',
        name: 'Movies',
        collectionType: 'movies',
      },
    ]);
  });

  it('keeps views that omit CollectionType and applies a fallback', () => {
    expect(
      mapViewsResponse({
        Items: [
          {
            Id: 'shows',
            Name: 'Shows',
          },
        ],
      })
    ).toEqual([
      {
        id: 'shows',
        name: 'Shows',
        collectionType: 'unknown',
      },
    ]);
  });
});

describe('mapItemsResponse', () => {
  it('maps Emby playback position ticks into the library item model', () => {
    expect(
      mapItemsResponse(
        {
          Items: [
            {
              Id: 'item-1',
              Name: 'Movie 1',
              RunTimeTicks: 600000000,
              UserData: {
                PlaybackPositionTicks: 42000000,
              },
            },
          ],
        },
        'https://demo.emby.local'
      )
    ).toEqual([
      {
        id: 'item-1',
        name: 'Movie 1',
        posterUrl: 'https://demo.emby.local/Items/item-1/Images/Primary',
        imageCandidates: [
          {
            url: 'https://demo.emby.local/Items/item-1/Images/Primary',
            kind: 'primary',
          },
          {
            url: 'https://demo.emby.local/Items/item-1/Images/Thumb',
            kind: 'thumb',
          },
          {
            url: 'https://demo.emby.local/Items/item-1/Images/Backdrop',
            kind: 'backdrop',
          },
        ],
        runtimeTicks: 600000000,
        communityRating: null,
        productionYear: null,
        serverPositionTicks: 42000000,
      },
    ]);
  });

  it('keeps the primary poster url while exposing ordered image candidates', () => {
    expect(
      mapItemsResponse(
        {
          Items: [
            {
              Id: 'item-2',
              Name: 'Movie 2',
            },
          ],
        },
        'https://demo.emby.local'
      )
    ).toEqual([
      {
        id: 'item-2',
        name: 'Movie 2',
        posterUrl: 'https://demo.emby.local/Items/item-2/Images/Primary',
        runtimeTicks: null,
        communityRating: null,
        productionYear: null,
        serverPositionTicks: null,
        imageCandidates: [
          {
            url: 'https://demo.emby.local/Items/item-2/Images/Primary',
            kind: 'primary',
          },
          {
            url: 'https://demo.emby.local/Items/item-2/Images/Thumb',
            kind: 'thumb',
          },
          {
            url: 'https://demo.emby.local/Items/item-2/Images/Backdrop',
            kind: 'backdrop',
          },
        ],
      },
    ]);
  });
});

describe('fetchItems', () => {
  it('uses the latest-added sort query by default and keeps limit support', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ Items: [] }),
    });

    await fetchItems('https://demo.emby.local', 'user-1', 'parent-1', 'token-1', {
      limit: 25,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestUrl.pathname).toBe('/Users/user-1/Items');
    expect(requestUrl.searchParams.get('ParentId')).toBe('parent-1');
    expect(requestUrl.searchParams.get('Limit')).toBe('25');
    expect(requestUrl.searchParams.get('SortBy')).toBe('DateCreated,SortName');
    expect(requestUrl.searchParams.get('SortOrder')).toBe('Descending,Ascending');
  });

  it('uses release-date sort fields when requested', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ Items: [] }),
    });

    await fetchItems('https://demo.emby.local', 'user-1', 'parent-1', 'token-1', {
      sortMode: 'release_date',
    });

    const requestUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestUrl.searchParams.get('SortBy')).toBe('PremiereDate,ProductionYear,SortName');
    expect(requestUrl.searchParams.get('SortOrder')).toBe('Descending,Descending,Ascending');
  });
});

describe('fetchItemDetails', () => {
  it('maps primary detail fields, artwork candidates, and media source streams', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        Id: 'movie-1',
        Name: 'Movie 1',
        Type: 'Movie',
        Overview: 'Primary overview.',
        Genres: ['Action', 'Sci-Fi'],
        CommunityRating: 8.2,
        OfficialRating: 'PG-13',
        ProductionYear: 2026,
        RunTimeTicks: 72000000000,
        ImageTags: {
          Primary: 'primary-tag',
          Thumb: 'thumb-tag',
        },
        BackdropImageTags: ['backdrop-tag'],
        UserData: {
          PlaybackPositionTicks: 42000000,
          Played: false,
        },
        People: [
          {
            Id: 'person-1',
            Name: 'Actor 1',
            Role: 'Lead',
            PrimaryImageTag: 'person-tag',
          },
        ],
        Studios: [
          {
            Id: 'studio-1',
            Name: 'Studio 1',
          },
        ],
        ExternalUrls: [
          {
            Name: 'IMDb',
            Url: 'https://example.local/title/movie-1',
          },
        ],
        MediaSources: [
          {
            Id: 'source-2160',
            Path: '/movies/movie-1-2160p.mkv',
            Container: 'mkv',
            Size: 27500000000,
            Bitrate: 35100000,
            MediaStreams: [
              {
                Type: 'Video',
                Codec: 'hevc',
                Width: 3840,
                Height: 2160,
                RealFrameRate: 60,
              },
              {
                Type: 'Audio',
                Index: 5,
                DisplayTitle: 'EAC3 5.1',
                Codec: 'eac3',
                Channels: 6,
                ChannelLayout: '5.1',
                IsDefault: true,
              },
            ],
          },
        ],
      }),
    });

    const details = await fetchItemDetails(
      'https://demo.emby.local',
      'user-1',
      'movie-1',
      'token-1'
    );

    const requestUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestUrl.pathname).toBe('/Users/user-1/Items/movie-1');
    expect(requestUrl.searchParams.get('Fields')).toContain('MediaSources');
    expect(requestUrl.searchParams.get('Fields')).toContain('Overview');
    expect(details).toEqual(
      expect.objectContaining({
        id: 'movie-1',
        name: 'Movie 1',
        type: 'Movie',
        overview: 'Primary overview.',
        genres: ['Action', 'Sci-Fi'],
        communityRating: 8.2,
        officialRating: 'PG-13',
        productionYear: 2026,
        runtimeTicks: 72000000000,
        serverPositionTicks: 42000000,
        posterUrl: 'https://demo.emby.local/Items/movie-1/Images/Primary',
        backdropUrl: 'https://demo.emby.local/Items/movie-1/Images/Backdrop',
        played: false,
      })
    );
    expect(details.imageCandidates).toEqual([
      {
        url: 'https://demo.emby.local/Items/movie-1/Images/Primary',
        kind: 'primary',
      },
      {
        url: 'https://demo.emby.local/Items/movie-1/Images/Thumb',
        kind: 'thumb',
      },
      {
        url: 'https://demo.emby.local/Items/movie-1/Images/Backdrop',
        kind: 'backdrop',
      },
    ]);
    expect(details.people).toEqual([
      {
        id: 'person-1',
        name: 'Actor 1',
        role: 'Lead',
        imageUrl: 'https://demo.emby.local/Items/person-1/Images/Primary',
      },
    ]);
    expect(details.studios).toEqual([{ id: 'studio-1', name: 'Studio 1' }]);
    expect(details.externalUrls).toEqual([
      {
        name: 'IMDb',
        url: 'https://example.local/title/movie-1',
      },
    ]);
    expect(details.mediaSources).toEqual([
      expect.objectContaining({
        id: 'source-2160',
        path: '/movies/movie-1-2160p.mkv',
        container: 'mkv',
        size: 27500000000,
        bitrate: 35100000,
        videoCodec: 'hevc',
        videoStream: expect.objectContaining({
          Width: 3840,
          Height: 2160,
          RealFrameRate: 60,
        }),
        audioStreams: [
          expect.objectContaining({
            Index: 5,
            DisplayTitle: 'EAC3 5.1',
            IsDefault: true,
          }),
        ],
      }),
    ]);
  });
});

describe('fetchResumeItems', () => {
  it('queries Emby resume items with user data and episode metadata', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        Items: [
          {
            Id: 'episode-1',
            Name: 'Resume Episode',
            Type: 'Episode',
            SeriesId: 'series-1',
            SeriesName: 'Series 1',
            ParentId: 'season-1',
            ParentIndexNumber: 1,
            IndexNumber: 2,
            RunTimeTicks: 18000000000,
            UserData: {
              PlaybackPositionTicks: 6000000000,
              LastPlayedDate: '2026-04-22T08:00:00.000Z',
            },
          },
        ],
      }),
    });

    const items = await fetchResumeItems('https://demo.emby.local', 'user-1', 'token-1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestUrl.pathname).toBe('/Users/user-1/Items/Resume');
    expect(requestUrl.searchParams.has('Limit')).toBe(false);
    expect(requestUrl.searchParams.get('IncludeItemTypes')).toBe('Movie,Episode');
    expect(requestUrl.searchParams.get('SortBy')).toBe('DatePlayed');
    expect(requestUrl.searchParams.get('SortOrder')).toBe('Descending');
    expect(requestUrl.searchParams.get('EnableUserData')).toBe('true');
    expect(requestUrl.searchParams.get('Fields')).toBe('ProductionYear,SeriesInfo');
    expect(items[0]).toEqual(
      expect.objectContaining({
        id: 'episode-1',
        type: 'Episode',
        seriesId: 'series-1',
        seriesName: 'Series 1',
        parentId: 'season-1',
        parentIndexNumber: 1,
        indexNumber: 2,
        serverPositionTicks: 6000000000,
        lastPlayedAt: '2026-04-22T08:00:00.000Z',
      })
    );
  });
});

describe('fetchResumableItems', () => {
  it('queries Emby item user data for resumable movies and episodes without a limit', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        Items: [
          {
            Id: 'episode-1',
            Name: 'Progress Episode',
            Type: 'Episode',
            SeriesId: 'series-1',
            SeriesName: 'Series 1',
            ParentId: 'season-1',
            ParentIndexNumber: 1,
            IndexNumber: 1,
            RunTimeTicks: 18000000000,
            UserData: {
              PlaybackPositionTicks: 6000000000,
              LastPlayedDate: '2026-04-22T08:00:00.000Z',
            },
          },
        ],
      }),
    });

    const items = await fetchResumableItems('https://demo.emby.local', 'user-1', 'token-1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestUrl.pathname).toBe('/Users/user-1/Items');
    expect(requestUrl.searchParams.has('Limit')).toBe(false);
    expect(requestUrl.searchParams.get('Recursive')).toBe('true');
    expect(requestUrl.searchParams.get('IncludeItemTypes')).toBe('Movie,Episode');
    expect(requestUrl.searchParams.get('Filters')).toBe('IsResumable');
    expect(requestUrl.searchParams.get('SortBy')).toBe('DatePlayed');
    expect(requestUrl.searchParams.get('SortOrder')).toBe('Descending');
    expect(requestUrl.searchParams.get('EnableUserData')).toBe('true');
    expect(items[0]).toEqual(
      expect.objectContaining({
        id: 'episode-1',
        type: 'Episode',
        serverPositionTicks: 6000000000,
        lastPlayedAt: '2026-04-22T08:00:00.000Z',
      })
    );
  });
});

describe('fetchEpisodes', () => {
  it('requests and maps episode media sources for version selection', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        Items: [
          {
            Id: 'episode-1',
            Name: 'Pilot',
            IndexNumber: 1,
            ParentIndexNumber: 1,
            Overview: 'Episode overview.',
            RunTimeTicks: 600000000,
            UserData: {
              PlaybackPositionTicks: 120000000,
              Played: true,
            },
            ImageTags: {
              Primary: 'tag-1',
            },
            MediaSources: [
              {
                Id: 'episode-1-2160',
                Path: '/series/pilot-2160p.mkv',
                Container: 'mkv',
                Size: 24000000000,
                Bitrate: 32000000,
                MediaStreams: [
                  {
                    Type: 'Video',
                    Codec: 'hevc',
                    Width: 3840,
                    Height: 2160,
                    RealFrameRate: 24,
                  },
                  {
                    Type: 'Audio',
                    Index: 2,
                    DisplayTitle: 'FLAC stereo',
                    Codec: 'flac',
                    Channels: 2,
                    ChannelLayout: 'stereo',
                    IsDefault: true,
                  },
                ],
              },
            ],
          },
        ],
      }),
    });

    const episodes = await fetchEpisodes(
      'https://demo.emby.local',
      'user-1',
      'series-1',
      'season-1',
      'token-1'
    );

    const requestUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestUrl.pathname).toBe('/Shows/series-1/Episodes');
    expect(requestUrl.searchParams.get('Fields')).toBe('Overview,MediaSources');
    expect(episodes[0].played).toBe(true);
    expect(episodes[0].mediaSources).toEqual([
      expect.objectContaining({
        id: 'episode-1-2160',
        path: '/series/pilot-2160p.mkv',
        videoCodec: 'hevc',
        audioStreams: [
          expect.objectContaining({
            Index: 2,
            DisplayTitle: 'FLAC stereo',
          }),
        ],
      }),
    ]);
    expect(episodes[0].imageCandidates).toEqual([
      {
        url: 'https://demo.emby.local/Items/episode-1/Images/Primary',
        kind: 'primary',
      },
      {
        url: 'https://demo.emby.local/Items/series-1/Images/Primary',
        kind: 'parent-primary',
      },
      {
        url: 'https://demo.emby.local/Items/series-1/Images/Thumb',
        kind: 'parent-thumb',
      },
      {
        url: 'https://demo.emby.local/Items/series-1/Images/Backdrop',
        kind: 'parent-backdrop',
      },
    ]);
  });

  it('falls back to series artwork when an episode has no primary image', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        Items: [
          {
            Id: 'episode-2',
            Name: 'No Poster',
            IndexNumber: 2,
            ParentIndexNumber: 1,
            MediaSources: [],
          },
        ],
      }),
    });

    const episodes = await fetchEpisodes(
      'https://demo.emby.local',
      'user-1',
      'series-1',
      'season-1',
      'token-1'
    );

    const [episode] = episodes;
    expect(episode).toBeDefined();

    if (!episode) {
      throw new Error('expected episode');
    }

    expect(episode.posterUrl).toBe(
      'https://demo.emby.local/Items/series-1/Images/Primary'
    );
    expect((episode.imageCandidates ?? [])[0]).toEqual({
      url: 'https://demo.emby.local/Items/series-1/Images/Primary',
      kind: 'parent-primary',
    });
  });

  it('maps Emby episode parent metadata for resume cards', () => {
    expect(
      mapItemsResponse(
        {
          Items: [
            {
              Id: 'episode-14',
              Name: '尘都无法忘记',
              Type: 'Episode',
              SeriesId: 'series-1',
              SeriesName: '一人之下',
              ParentId: 'season-6',
              ParentIndexNumber: 6,
              IndexNumber: 14,
              RunTimeTicks: 600000000,
              UserData: {
                PlaybackPositionTicks: 42000000,
              },
            },
          ],
        },
        'https://demo.emby.local'
      )
    ).toEqual([
      expect.objectContaining({
        id: 'episode-14',
        name: '尘都无法忘记',
        type: 'Episode',
        seriesId: 'series-1',
        seriesName: '一人之下',
        parentId: 'season-6',
        parentIndexNumber: 6,
        indexNumber: 14,
        serverPositionTicks: 42000000,
      }),
    ]);
  });
});

describe('fetchSearchItems', () => {
  it('queries Emby items by search term', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        Items: [
          {
            Id: 'dream-of-red-chamber',
            Name: '红楼梦',
          },
        ],
      }),
    });

    await fetchSearchItems('https://demo.emby.local', 'user-1', '红楼梦', 'token-1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestUrl.pathname).toBe('/Users/user-1/Items');
    expect(requestUrl.searchParams.get('SearchTerm')).toBe('红楼梦');
    expect(requestUrl.searchParams.get('Recursive')).toBe('true');
    expect(requestUrl.searchParams.get('IncludeItemTypes')).toBe('Movie,Series');
  });

  it('falls back to local title matching when Emby search returns no items', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ Items: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          Items: [
            {
              Id: 'future-boy-conan',
              Name: '未来少年柯南',
            },
            {
              Id: 'other-item',
              Name: '红楼梦',
            },
          ],
        }),
      });

    const items = await fetchSearchItems('https://demo.emby.local', 'user-1', '柯南', 'token-1');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const fallbackUrl = new URL(fetchMock.mock.calls[1][0] as string);
    expect(fallbackUrl.searchParams.has('SearchTerm')).toBe(false);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('未来少年柯南');
  });
});
