import type { IpcMain } from 'electron';
import type { Settings } from '@shared/models/settings';
import {
  isPlayerLoadInput,
  isPlayerOpenInput,
  isPlayerStartupFailureInput,
  type PlayerLoadInput,
  type PlayerOpenInput,
  type PlayerOpenResult,
  type PlayerStartupFailureInput,
} from '@shared/models/playerStartup';
import type { LaunchPlayerSettings, MpvController } from '../player/mpvController';

type StartupController = Pick<
  MpvController,
  'open' | 'load' | 'updateEpisodeSelector' | 'reportStartupFailure'
>;

export interface PlayerStartupDependencies {
  controller: StartupController;
  readSettings: () => Settings;
  prepareLoad: (input: PlayerLoadInput) => Promise<PlayerLoadInput>;
  enrichEpisodeSelector?: (input: PlayerLoadInput) => Promise<PlayerLoadInput>;
}

function selectPlayerSettings(settings: Settings): LaunchPlayerSettings {
  return {
    playback: settings.playback,
    subtitles: settings.subtitles,
    danmakuServers: settings.danmakuServers,
    danmaku: settings.danmaku,
  };
}

export function createPlayerStartupHandlers(dependencies: PlayerStartupDependencies) {
  return {
    async open(input: unknown): Promise<PlayerOpenResult> {
      if (!isPlayerOpenInput(input)) throw new Error('Invalid player open request.');
      const settings = dependencies.readSettings();
      return dependencies.controller.open(input, settings.proxy, selectPlayerSettings(settings));
    },
    async load(input: unknown): Promise<void> {
      if (!isPlayerLoadInput(input)) throw new Error('Invalid player load request.');
      const settings = dependencies.readSettings();
      const prepared = await dependencies.prepareLoad(input);
      await dependencies.controller.load(prepared, settings.proxy, selectPlayerSettings(settings));
      if (dependencies.enrichEpisodeSelector && prepared.episodeSelector) {
        void dependencies.enrichEpisodeSelector(prepared)
          .then((enriched) => dependencies.controller.updateEpisodeSelector(enriched))
          .catch(() => undefined);
      }
    },
    async reportFailure(input: unknown): Promise<void> {
      if (!isPlayerStartupFailureInput(input)) throw new Error('Invalid player startup failure.');
      if (!dependencies.controller.reportStartupFailure(input as PlayerStartupFailureInput)) {
        throw new Error('Unknown or stale player startup failure target.');
      }
    },
  };
}

export function registerPlayerStartupIpc(
  ipc: Pick<IpcMain, 'handle'>,
  dependencies: PlayerStartupDependencies
): void {
  const handlers = createPlayerStartupHandlers(dependencies);
  ipc.handle('player:open', (_event, input) => handlers.open(input));
  ipc.handle('player:load', (_event, input) => handlers.load(input));
  ipc.handle('player:startup-failure', (_event, input) => handlers.reportFailure(input));
}
