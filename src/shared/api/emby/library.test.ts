import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchItems, mapItemsResponse, mapViewsResponse } from './library';

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
