// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerStoryMarkerIpc } from './storyMarkers';

const handleMock = vi.hoisted(() => vi.fn());
vi.mock('electron', () => ({ ipcMain: { handle: handleMock } }));

describe('registerStoryMarkerIpc', () => {
  beforeEach(() => handleMock.mockReset());

  it('forwards valid updates', () => {
    const setStoryMarkers = vi.fn();
    registerStoryMarkerIpc({ setStoryMarkers });
    const handler = handleMock.mock.calls.find(([channel]) => channel === 'player:set-story-markers')?.[1];
    const update = { itemId: 'episode-1', markers: [] };
    expect(handler(undefined, update)).toBeUndefined();
    expect(setStoryMarkers).toHaveBeenCalledWith(update);
  });

  it('rejects invalid unknown payloads without forwarding', () => {
    const setStoryMarkers = vi.fn();
    registerStoryMarkerIpc({ setStoryMarkers });
    const handler = handleMock.mock.calls.find(([channel]) => channel === 'player:set-story-markers')?.[1];
    expect(() => handler(undefined, { itemId: ' ', markers: [] })).toThrow('Invalid story marker update.');
    expect(setStoryMarkers).not.toHaveBeenCalled();
  });
});
