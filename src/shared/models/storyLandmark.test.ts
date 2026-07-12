import { describe, expect, it } from 'vitest';
import { isPlayerStoryMarkerUpdate } from './storyLandmark';

describe('isPlayerStoryMarkerUpdate', () => {
  const valid = {
    itemId: 'episode-1',
    markers: [{ startSeconds: 12, names: ['Intro'], kinds: ['intro'] }],
  };

  it('accepts valid snapshots and empty clears', () => {
    expect(isPlayerStoryMarkerUpdate(valid)).toBe(true);
    expect(isPlayerStoryMarkerUpdate({ itemId: 'episode-1', markers: [] })).toBe(true);
  });

  it.each([
    [{ ...valid, itemId: '   ' }],
    [{ ...valid, markers: [{ ...valid.markers[0], startSeconds: -1 }] }],
    [{ ...valid, markers: [{ ...valid.markers[0], startSeconds: Number.NaN }] }],
    [{ ...valid, markers: [{ ...valid.markers[0], names: ['A', 'A'] }] }],
    [{ ...valid, markers: [{ ...valid.markers[0], names: [' '] }] }],
    [{ ...valid, markers: [{ ...valid.markers[0], kinds: [] }] }],
    [{ ...valid, markers: [{ ...valid.markers[0], kinds: ['intro', 'intro'] }] }],
    [{ ...valid, markers: [{ ...valid.markers[0], kinds: ['ad'] }] }],
    [{ itemId: 'episode-1', markers: {} }],
    [null],
  ])('rejects malformed payload %#', (input) => {
    expect(isPlayerStoryMarkerUpdate(input)).toBe(false);
  });
});
