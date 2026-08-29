// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createDefaultSettings } from '@shared/models/settings';
import { createPlayerStartupHandlers } from './playerStartup';

describe('player startup IPC handlers', () => {
  function createHarness() {
    const settings = createDefaultSettings();
    const controller = {
      open: vi.fn().mockResolvedValue({ launchRequestId: 1, playerSessionId: 4 }),
      load: vi.fn().mockResolvedValue(undefined),
      updateEpisodeSelector: vi.fn().mockReturnValue(true),
      reportStartupFailure: vi.fn().mockReturnValue(true),
    };
    const prepareLoad = vi.fn(async (input) => ({ ...input, streamUrl: `proxy:${input.streamUrl}` }));
    const enrichEpisodeSelector = vi.fn(async (input) => input);
    const handlers = createPlayerStartupHandlers({
      controller,
      enrichEpisodeSelector,
      prepareLoad,
      readSettings: () => settings,
    });
    return { controller, enrichEpisodeSelector, handlers, prepareLoad, settings };
  }

  it('opens a surface without running HLS proxy or thumbnail preparation', async () => {
    const { controller, enrichEpisodeSelector, handlers, prepareLoad, settings } = createHarness();
    const input = { launchRequestId: 1, itemId: 'movie-1', title: 'Movie 1' };

    await expect(handlers.open(input)).resolves.toEqual({ launchRequestId: 1, playerSessionId: 4 });

    expect(prepareLoad).not.toHaveBeenCalled();
    expect(enrichEpisodeSelector).not.toHaveBeenCalled();
    expect(controller.open).toHaveBeenCalledWith(input, settings.proxy, expect.any(Object));
  });

  it('validates and prepares a load for exactly one targeted session', async () => {
    const { controller, handlers, prepareLoad } = createHarness();
    const input = {
      playerSessionId: 4,
      launchRequestId: 1,
      loadRequestId: 1,
      itemId: 'movie-1',
      title: 'Movie 1',
      streamUrl: 'https://media.example/master.m3u8',
    };

    await expect(handlers.load(input)).resolves.toBeUndefined();
    expect(prepareLoad).toHaveBeenCalledWith(input);
    expect(controller.load).toHaveBeenCalledWith(
      expect.objectContaining({ playerSessionId: 4, streamUrl: `proxy:${input.streamUrl}` }),
      expect.any(Object),
      expect.any(Object)
    );
    await expect(handlers.load({ ...input, playerSessionId: 0 })).rejects.toThrow('Invalid player load');
  });

  it('accepts media load before thumbnail enrichment and applies enrichment to the same generation', async () => {
    let resolveEnrichment!: (value: Record<string, unknown>) => void;
    const enrichment = new Promise<Record<string, unknown>>((resolve) => {
      resolveEnrichment = resolve;
    });
    const { controller, handlers, enrichEpisodeSelector } = createHarness();
    enrichEpisodeSelector.mockReturnValueOnce(enrichment);
    const input = {
      playerSessionId: 4,
      launchRequestId: 1,
      loadRequestId: 2,
      itemId: 'episode-1',
      title: 'Episode 1',
      streamUrl: 'https://media.example/master.m3u8',
      episodeSelector: {
        currentItemId: 'episode-1',
        episodes: [{ itemId: 'episode-1', title: 'Episode 1' }],
      },
    };

    await expect(handlers.load(input)).resolves.toBeUndefined();
    expect(controller.load).toHaveBeenCalledOnce();
    expect(controller.updateEpisodeSelector).not.toHaveBeenCalled();

    resolveEnrichment({
      ...input,
      streamUrl: `proxy:${input.streamUrl}`,
      episodeSelector: {
        ...input.episodeSelector,
        episodes: [{ ...input.episodeSelector.episodes[0], thumbnailPath: 'C:\\cache\\episode-1.bgra' }],
      },
    });
    await vi.waitFor(() => expect(controller.updateEpisodeSelector).toHaveBeenCalledWith(
      expect.objectContaining({ playerSessionId: 4, launchRequestId: 1, loadRequestId: 2 })
    ));
  });
});
