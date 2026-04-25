import { app, BrowserWindow, ipcMain, session } from 'electron';
import { readPersistedState, registerStorageIpc } from './ipc/storage';
import { applyProxySettings, applyProxySettingsWithFallback } from './network/proxy';
import {
  MpvController,
  type LaunchMpvInput,
  type MpvProgressSnapshot,
} from './player/mpvController';
import { HlsProxyServer } from './player/hlsProxy';
import { createMainWindow } from './window';
import { preflightPlaybackStreamSource } from '@shared/api/emby/playback';

function sendPlayerProgress(snapshot: MpvProgressSnapshot) {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('player:progress', snapshot);
  }
}

const mpvController = new MpvController({
  isPackaged: app.isPackaged,
  onProgress: sendPlayerProgress,
});
const hlsProxyServer = new HlsProxyServer((url, init) => session.defaultSession.fetch(url, init));

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

app.whenReady().then(() => {
  const persistedState = readPersistedState();

  return applyProxySettingsWithFallback(session.defaultSession, persistedState.settings.proxy).then(
    () => {
      registerStorageIpc({
        onSettingsChanged: (settings) =>
          applyProxySettings(session.defaultSession, settings.proxy),
      });
      ipcMain.handle('player:launch', async (_event, input: LaunchMpvInput) =>
        mpvController.launch(await prepareLaunchInput(input), readPersistedState().settings.proxy)
      );
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
