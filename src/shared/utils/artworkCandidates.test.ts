import { describe, expect, it } from 'vitest';
import {
  createArtworkCandidateSet,
  createParentArtworkCandidates,
  normalizeArtworkCandidates,
} from './artworkCandidates';

describe('normalizeArtworkCandidates', () => {
  it('orders preferred, alternate, and parent artwork while removing duplicates', () => {
    expect(
      normalizeArtworkCandidates({
        preferredUrl: 'https://demo.local/primary.jpg',
        candidates: [
          {
            url: 'https://demo.local/primary.jpg',
            kind: 'primary',
          },
          {
            url: 'https://demo.local/thumb.jpg',
            kind: 'thumb',
          },
          {
            url: '',
            kind: 'backdrop',
          },
        ],
        parentCandidates: [
          {
            url: 'https://demo.local/series.jpg',
            kind: 'parent-primary',
          },
        ],
      })
    ).toEqual([
      {
        url: 'https://demo.local/primary.jpg',
        kind: 'primary',
      },
      {
        url: 'https://demo.local/thumb.jpg',
        kind: 'thumb',
      },
      {
        url: 'https://demo.local/series.jpg',
        kind: 'parent-primary',
      },
    ]);
  });
});

describe('createArtworkCandidateSet', () => {
  it('uses the first available candidate as the poster url', () => {
    expect(
      createArtworkCandidateSet({
        preferredUrl: null,
        candidates: [
          {
            url: 'https://demo.local/thumb.jpg',
            kind: 'thumb',
          },
        ],
      })
    ).toEqual({
      posterUrl: 'https://demo.local/thumb.jpg',
      imageCandidates: [
        {
          url: 'https://demo.local/thumb.jpg',
          kind: 'thumb',
        },
      ],
    });
  });

  it('returns an empty poster url when no artwork is available', () => {
    expect(createArtworkCandidateSet({})).toEqual({
      posterUrl: '',
      imageCandidates: [],
    });
  });
});

describe('createParentArtworkCandidates', () => {
  it('marks inherited artwork as parent candidates', () => {
    expect(
      createParentArtworkCandidates([
        {
          url: 'https://demo.local/series-primary.jpg',
          kind: 'primary',
        },
        {
          url: 'https://demo.local/series-thumb.jpg',
          kind: 'thumb',
        },
      ])
    ).toEqual([
      {
        url: 'https://demo.local/series-primary.jpg',
        kind: 'parent-primary',
      },
      {
        url: 'https://demo.local/series-thumb.jpg',
        kind: 'parent-thumb',
      },
    ]);
  });
});
