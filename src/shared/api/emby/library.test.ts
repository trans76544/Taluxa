import { describe, expect, it } from 'vitest';
import { mapViewsResponse } from './library';

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
