import { app, BrowserWindow, ipcMain, nativeImage, protocol, screen, session } from 'electron';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readPersistedState, registerStorageIpc, writeSettingsPatchFromMain } from './ipc/storage';
import { registerImageCacheIpc } from './ipc/imageCache';
import { ImageCache, IMAGE_CACHE_PROTOCOL } from './image/imageCache';
import { registerImageCacheProtocol } from './image/protocol';
import { applyProxySettings, applyProxySettingsWithFallback } from './network/proxy';
import {
  MpvController,
  type LaunchMpvInput,
  type MpvProgressSnapshot,
  type MpvWindowBounds,
} from './player/mpvController';
import { HlsProxyServer } from './player/hlsProxy';
import { fetchDandanplayDanmaku } from './player/danmaku';
import { createMainWindow } from './window';
import { preflightPlaybackStreamSource } from '@shared/api/emby/playback';
import type { ImageCacheResolution } from '@shared/models/settings';

protocol.registerSchemesAsPrivileged([
  {
    scheme: IMAGE_CACHE_PROTOCOL,
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
    },
  },
]);

function sendPlayerProgress(snapshot: MpvProgressSnapshot) {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('player:progress', snapshot);
  }
}

function getMpvWindowMaximizeBounds(): MpvWindowBounds | null {
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);

  return display.workArea;
}

const mpvController = new MpvController({
  isPackaged: app.isPackaged,
  fetchDanmaku: (input, servers) =>
    fetchDandanplayDanmaku(input, servers, {
      fetcher: (url, init) => session.defaultSession.fetch(url, init),
      logger: (message) => console.info(message),
    }),
  getWindowMaximizeBounds: getMpvWindowMaximizeBounds,
  onEpisodeSelect: (itemId) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('player:episode-select', itemId);
    }
  },
  onPlayerSettingsPatch: async (settingsPatch) => {
    await writeSettingsPatchFromMain(settingsPatch);
  },
  onProgress: sendPlayerProgress,
});
const hlsProxyServer = new HlsProxyServer((url, init) => session.defaultSession.fetch(url, init));
const MPV_EPISODE_THUMBNAIL_WIDTH = 128;
const MPV_EPISODE_THUMBNAIL_HEIGHT = 72;
const MPV_EPISODE_THUMBNAIL_TIMEOUT_MS = 700;

function getImageCacheMaxDimension(resolution: ImageCacheResolution): number | null {
  return resolution === 'original' ? null : resolution;
}

function resizeCachedImage(bytes: Buffer, contentType: string, maxDimension: number) {
  const image = nativeImage.createFromBuffer(bytes);
  const size = image.getSize();
  const longestSide = Math.max(size.width, size.height);

  if (!size.width || !size.height || longestSide <= maxDimension) {
    return { bytes, contentType };
  }

  const resized =
    size.width >= size.height
      ? image.resize({ width: maxDimension })
      : image.resize({ height: maxDimension });
  const nextBytes =
    contentType === 'image/png' ? resized.toPNG() : resized.toJPEG(82);

  return {
    bytes: nextBytes.length > 0 ? nextBytes : bytes,
    contentType: contentType === 'image/png' ? 'image/png' : 'image/jpeg',
  };
}

async function prepareLaunchInput(input: LaunchMpvInput): Promise<LaunchMpvInput> {
  if (!input.streamUrl.toLowerCase().includes('.m3u8')) {
    return input;
  }

  return {
    ...input,
    httpHeaders: {},
    streamUrl: await hlsProxyServer.createProxiedUrl({
      httpHeaders: input.httpHeaders ?? {},
      streamUrl: input.streamUrl,
    }),
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Timed out preparing thumbnail')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}

async function prepareEpisodeThumbnail(
  imageCache: ImageCache,
  thumbnailDir: string,
  itemId: string,
  thumbnailUrl: string
) {
  const { filePath } = await imageCache.resolve(thumbnailUrl);
  const sourceBytes = await readFile(filePath);
  const image = nativeImage
    .createFromBuffer(sourceBytes)
    .resize({ width: MPV_EPISODE_THUMBNAIL_WIDTH, height: MPV_EPISODE_THUMBNAIL_HEIGHT });
  const bitmap = image.toBitmap();

  if (bitmap.length === 0) {
    throw new Error('Thumbnail bitmap was empty');
  }

  await mkdir(thumbnailDir, { recursive: true });

  const cacheKey = createHash('sha256')
    .update(JSON.stringify({ itemId, thumbnailUrl }))
    .digest('hex');
  const thumbnailPath = join(thumbnailDir, `${cacheKey}.bgra`);
  await writeFile(thumbnailPath, bitmap);

  return {
    thumbnailHeight: MPV_EPISODE_THUMBNAIL_HEIGHT,
    thumbnailPath,
    thumbnailStride: MPV_EPISODE_THUMBNAIL_WIDTH * 4,
    thumbnailWidth: MPV_EPISODE_THUMBNAIL_WIDTH,
  };
}

async function prepareEpisodeSelectorThumbnails(
  input: LaunchMpvInput,
  imageCache: ImageCache,
  thumbnailDir: string
): Promise<LaunchMpvInput> {
  const episodeSelector = input.episodeSelector;

  if (!episodeSelector) {
    return input;
  }

  const episodes = await Promise.all(
    episodeSelector.episodes.map(async (episode) => {
      const thumbnailUrl = episode.thumbnailUrl?.trim();

      if (!thumbnailUrl) {
        return episode;
      }

      try {
        return {
          ...episode,
          ...(await withTimeout(
            prepareEpisodeThumbnail(imageCache, thumbnailDir, episode.itemId, thumbnailUrl),
            MPV_EPISODE_THUMBNAIL_TIMEOUT_MS
          )),
        };
      } catch {
        return episode;
      }
    })
  );

  return {
    ...input,
    episodeSelector: {
      ...episodeSelector,
      episodes,
    },
  };
}

function registerWindowControlIpc() {
  ipcMain.on('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.on('window:maximize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);

    if (!window) {
      return;
    }

    if (window.isMaximized()) {
      window.unmaximize();
      return;
    }

    window.maximize();
  });

  ipcMain.on('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
}

app.whenReady().then(() => {
  app.setName('Taluxa');

  const persistedState = readPersistedState();
  const imageCache = new ImageCache({
    cacheDir: join(app.getPath('userData'), 'image-cache'),
    enabled: persistedState.settings.cache.imageCacheEnabled,
    fetcher: (url) => session.defaultSession.fetch(url),
    maxDimension: getImageCacheMaxDimension(persistedState.settings.cache.imageCacheResolution),
    maxBytes: persistedState.settings.cache.imageCacheMaxBytes,
    transformImage: resizeCachedImage,
  });

  return applyProxySettingsWithFallback(session.defaultSession, persistedState.settings.proxy).then(
    () => {
      registerStorageIpc({
        onSettingsChanged: async (settings) => {
          imageCache.configure({
            enabled: settings.cache.imageCacheEnabled,
            maxDimension: getImageCacheMaxDimension(settings.cache.imageCacheResolution),
            maxBytes: settings.cache.imageCacheMaxBytes,
          });
          await applyProxySettings(session.defaultSession, settings.proxy);
        },
      });
      registerWindowControlIpc();
      registerImageCacheProtocol(imageCache);
      registerImageCacheIpc(imageCache);
      ipcMain.handle('player:launch', async (_event, input: LaunchMpvInput) => {
        const settings = readPersistedState().settings;
        const preparedInput = await prepareEpisodeSelectorThumbnails(
          await prepareLaunchInput(input),
          imageCache,
          join(app.getPath('userData'), 'mpv-episode-thumbnails')
        );

        return mpvController.launch(
          preparedInput,
          settings.proxy,
          {
            playback: settings.playback,
            subtitles: settings.subtitles,
            danmakuServers: settings.danmakuServers,
            danmaku: settings.danmaku,
          }
        );
      });
      ipcMain.handle('player:switch-episode', async (_event, input: LaunchMpvInput) => {
        const settings = readPersistedState().settings;
        const preparedInput = await prepareLaunchInput(input);

        return mpvController.switchEpisode(
          preparedInput,
          settings.proxy,
          {
            playback: settings.playback,
            subtitles: settings.subtitles,
            danmakuServers: settings.danmakuServers,
            danmaku: settings.danmaku,
          }
        );
      });
      ipcMain.handle(
        'player:preflight',
        (_event, input: Pick<LaunchMpvInput, 'httpHeaders' | 'streamUrl'>) =>
          preflightPlaybackStreamSource(
            {
              httpHeaders: input.httpHeaders ?? {},
              streamUrl: input.streamUrl,
            },
            (url, init) => session.defaultSession.fetch(url, init)
          )
      );
      createMainWindow();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          createMainWindow();
        }
      });
    }
  );
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  hlsProxyServer.close();
});
