// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerStoryMarkerIpc } from './storyMarkers';

const handleMock = vi.hoisted(() => vi.fn());
vi.mock('electron', () => ({ ipcMain: { handle: handleMock } }));

describe('registerStoryMarkerIpc', () => {
  beforeEach(() => handleMock.mockReset());

  it('forwards valid updates', () => {
    const setStoryMarkers = vi.fn(() => true);
    const logger = vi.fn();
    registerStoryMarkerIpc({ setStoryMarkers }, logger);
    const handler = handleMock.mock.calls.find(([channel]) => channel === 'player:set-story-markers')?.[1];
    const update = { itemId: 'episode-1', markers: [] };
    expect(handler(undefined, update)).toBeUndefined();
    expect(setStoryMarkers).toHaveBeenCalledWith(update);
    expect(logger).toHaveBeenCalledWith('[story-markers] stage=mpv accepted=true markers=0');
  });

  it('rejects invalid unknown payloads without forwarding', () => {
    const setStoryMarkers = vi.fn();
    registerStoryMarkerIpc({ setStoryMarkers });
    const handler = handleMock.mock.calls.find(([channel]) => channel === 'player:set-story-markers')?.[1];
    expect(() => handler(undefined, { itemId: ' ', markers: [] })).toThrow('Invalid story marker update.');
    expect(setStoryMarkers).not.toHaveBeenCalled();
  });

  it('logs validated non-sensitive fetch diagnostics', () => {
    const logger = vi.fn();
    registerStoryMarkerIpc({ setStoryMarkers: vi.fn(() => true) }, logger);
    const handler = handleMock.mock.calls.find(([channel]) => channel === 'player:story-marker-diagnostic')?.[1];
    expect(handler(undefined, {
      stage: 'response', status: 200, itemChapterCount: 3, mediaSourceCount: 1,
      selectedMediaSourceChapterCount: 2,
    })).toBeUndefined();
    expect(logger).toHaveBeenCalledWith('[story-markers] stage=response status=200 itemChapters=3 mediaSources=1 selectedSourceChapters=2');
  });

  it('rejects invalid diagnostics without logging', () => {
    const logger = vi.fn();
    registerStoryMarkerIpc({ setStoryMarkers: vi.fn(() => true) }, logger);
    const handler = handleMock.mock.calls.find(([channel]) => channel === 'player:story-marker-diagnostic')?.[1];
    expect(() => handler(undefined, { stage: 'response', status: 200, itemChapterCount: -1 })).toThrow('Invalid story marker diagnostic.');
    expect(logger).not.toHaveBeenCalled();
  });
});
