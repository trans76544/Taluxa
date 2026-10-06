import type { IpcMain } from 'electron';
import { isNextEpisodeMediaPreloadInput } from '@shared/models/mediaPreload';
import type { NextEpisodeMediaCache } from '../player/nextEpisodeMediaCache';

interface Selection {
  playerSessionId: number; itemId: string; streamUrl: string; httpHeaders?: Record<string, string>;
  authMode?: 'header' | 'local-proxy' | 'tokenless'; startSeconds?: number;
}
export function createPlayerMediaPreloadHandlers(cache: NextEpisodeMediaCache) {
  return {
    async preload(input: unknown): Promise<void> {
      if (!isNextEpisodeMediaPreloadInput(input)) throw new Error('Invalid media preload request.');
      await cache.prefetch(input);
    },
    prepareSelection<T extends Selection>(input: T): T & Selection {
      const streamUrl = cache.consume(input);
      return streamUrl ? { ...input, streamUrl, httpHeaders: {}, authMode: 'local-proxy' } : input;
    },
  };
}
export function registerPlayerMediaPreloadIpc(ipc: Pick<IpcMain, 'handle'>, cache: NextEpisodeMediaCache): void {
  const handlers = createPlayerMediaPreloadHandlers(cache);
  ipc.handle('player:preload-next-episode', (_event, input) => handlers.preload(input));
}
