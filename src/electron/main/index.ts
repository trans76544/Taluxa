import { app, BrowserWindow, ipcMain, nativeImage, protocol, session } from 'electron';
import { join } from 'node:path';
import { readPersistedState, registerStorageIpc } from './ipc/storage';
import { registerImageCacheIpc } from './ipc/imageCache';
import { ImageCache, IMAGE_CACHE_PROTOCOL } from './image/imageCache';
import { registerImageCacheProtocol } from './image/protocol';
import { applyProxySettings, applyProxySettingsWithFallback } from './network/proxy';
import {
  MpvController,
  type LaunchMpvInput,
  type MpvProgressSnapshot,
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

const mpvController = new MpvController({
  isPackaged: app.isPackaged,
  fetchDanmaku: (input, servers) =>
    fetchDandanplayDanmaku(input, servers, {
      fetcher: (url, init) => session.defaultSession.fetch(url, init),
      logger: (message) => console.info(message),
    }),
  onProgress: sendPlayerProgress,
});
const hlsProxyServer = new HlsProxyServer((url, init) => session.defaultSession.fetch(url, init));

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

        return mpvController.launch(
          await prepareLaunchInput(input),
          settings.proxy,
          settings.danmakuServers,
          settings.danmaku
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
