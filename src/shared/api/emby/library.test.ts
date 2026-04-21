import { describe, expect, it } from 'vitest';
import { mapItemsResponse, mapViewsResponse } from './library';

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
        runtimeTicks: 600000000,
        serverPositionTicks: 42000000,
      },
    ]);
  });
});
