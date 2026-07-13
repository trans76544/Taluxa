import { describe, expect, it, vi } from 'vitest';
import { fetchStoryTimelineMarkers, normalizeEmbyStoryTimelineMarkers } from './storyLandmarks';
import type { EmbyFetch } from './client';

describe('fetchStoryTimelineMarkers', () => {
  it('uses authenticated item fields and prefers selected media-source chapters', async () => {
    let requestInit: RequestInit | undefined;
    const fetcher: EmbyFetch = vi.fn(async (_url, init) => {
      requestInit = init;
      return new Response(JSON.stringify({
      Chapters: [{ Name: 'Item', MarkerType: 'Chapter', StartPositionTicks: 10_000_000 }],
      MediaSources: [{ Id: 'source-1', Chapters: [{ Name: 'Source', StartPositionTicks: 20_000_000 }] }],
      }));
    });
    const result = await fetchStoryTimelineMarkers({ serverUrl: 'https://emby.test', userId: 'u /', accessToken: 'token', itemId: 'i /', mediaSourceId: 'source-1', durationSeconds: null, fetcher });

    expect(fetcher).toHaveBeenCalledWith('https://emby.test/Users/u%20%2F/Items/i%20%2F', expect.objectContaining({ method: 'GET' }));
    expect((requestInit?.headers as Headers).get('X-Emby-Token')).toBe('token');
    expect(result).toEqual([{ startSeconds: 2, names: ['Source'], kinds: ['chapter'] }]);
  });

  it('maps, filters, sorts, deduplicates and merges relative to the earliest anchor', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ Chapters: [
      { Name: '', MarkerType: 'CreditsStart', StartPositionTicks: 50_000_000 },
      { Name: ' ignored ', MarkerType: 'IntroEnd', StartPositionTicks: 20_000_000 },
      { Name: ' A ', MarkerType: 'Chapter', StartPositionTicks: 10_000_000 },
      { Name: 'A', MarkerType: 'IntroStart', StartPositionTicks: 18_000_000 },
      { Name: '', MarkerType: 'IntroStart', StartPositionTicks: 21_000_000 },
      { Name: 'bad', MarkerType: 'Unknown', StartPositionTicks: 30_000_000 },
      { Name: 'late', StartPositionTicks: 110_000_000 },
      { Name: 'negative', StartPositionTicks: -1 },
    ] })));

    await expect(fetchStoryTimelineMarkers({ serverUrl: 'https://emby.test', userId: 'u', accessToken: 't', itemId: 'i', durationSeconds: 10, fetcher })).resolves.toEqual([
      { startSeconds: 1, names: ['A'], kinds: ['chapter', 'intro'] },
      { startSeconds: 2.1, names: ['片头'], kinds: ['intro'] },
      { startSeconds: 5, names: ['片尾'], kinds: ['credits'] },
    ]);
  });

  it('falls back to item chapters when the selected source has no chapter array', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ Chapters: [{ Name: 'Item', StartPositionTicks: 1 }], MediaSources: [{ Id: 'source-1' }] })));
    await expect(fetchStoryTimelineMarkers({ serverUrl: 'https://emby.test', userId: 'u', accessToken: 't', itemId: 'i', mediaSourceId: 'source-1', durationSeconds: null, fetcher })).resolves.toEqual([{ startSeconds: 1e-7, names: ['Item'], kinds: ['chapter'] }]);
  });

  it('falls back to non-empty item chapters when the selected source chapters are empty', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ Chapters: [{ Name: 'Item', StartPositionTicks: 1 }], MediaSources: [{ Id: 'source-1', Chapters: [] }] })));
    await expect(fetchStoryTimelineMarkers({ serverUrl: 'https://emby.test', userId: 'u', accessToken: 't', itemId: 'i', mediaSourceId: 'source-1', durationSeconds: null, fetcher })).resolves.toEqual([{ startSeconds: 1e-7, names: ['Item'], kinds: ['chapter'] }]);
  });

  it('uses the sole non-empty source when item chapters and source selection are absent', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ MediaSources: [{ Id: 'empty', Chapters: [] }, { Id: 'only', Chapters: [{ Name: 'Only', StartPositionTicks: 1 }] }] })));
    await expect(fetchStoryTimelineMarkers({ serverUrl: 'https://emby.test', userId: 'u', accessToken: 't', itemId: 'i', durationSeconds: null, fetcher })).resolves.toEqual([{ startSeconds: 1e-7, names: ['Only'], kinds: ['chapter'] }]);
  });

  it('returns no markers when multiple unselected sources contain chapters', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ MediaSources: [{ Id: 'a', Chapters: [{ StartPositionTicks: 1 }] }, { Id: 'b', Chapters: [{ StartPositionTicks: 2 }] }] })));
    await expect(fetchStoryTimelineMarkers({ serverUrl: 'https://emby.test', userId: 'u', accessToken: 't', itemId: 'i', durationSeconds: null, fetcher })).resolves.toEqual([]);
  });

  it.each([undefined, Number.NaN, 0, -1])('treats %s duration as unknown', (durationSeconds) => {
    expect(normalizeEmbyStoryTimelineMarkers([{ Name: 'Late', StartPositionTicks: 20_000_000 }], durationSeconds)).toEqual([{ startSeconds: 2, names: ['Late'], kinds: ['chapter'] }]);
  });

  it('filters markers beyond a positive finite duration', () => {
    expect(normalizeEmbyStoryTimelineMarkers([{ StartPositionTicks: 20_000_000 }], 1)).toEqual([]);
  });

  it('returns empty markers for a malformed successful payload', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(null)));
    await expect(fetchStoryTimelineMarkers({ serverUrl: 'https://emby.test', userId: 'u', accessToken: 't', itemId: 'i', durationSeconds: null, fetcher })).resolves.toEqual([]);
  });

  it('rejects an unsuccessful item response', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 503 }));
    await expect(fetchStoryTimelineMarkers({ serverUrl: 'https://emby.test', userId: 'u', accessToken: 't', itemId: 'i', durationSeconds: null, fetcher })).rejects.toThrow('503');
  });
});
