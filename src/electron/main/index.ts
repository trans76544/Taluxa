import { app, BrowserWindow, ipcMain, session } from 'electron';
import { readPersistedState, registerStorageIpc } from './ipc/storage';
import { applyProxySettings, applyProxySettingsWithFallback } from './network/proxy';
import {
  MpvController,
  type LaunchMpvInput,
  type MpvProgressSnapshot,
} from './player/mpvController';
import { createMainWindow } from './window';

function sendPlayerProgress(snapshot: MpvProgressSnapshot) {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('player:progress', snapshot);
  }
}

const mpvController = new MpvController({
  isPackaged: app.isPackaged,
  onProgress: sendPlayerProgress,
});

app.whenReady().then(() => {
  const persistedState = readPersistedState();

  return applyProxySettingsWithFallback(session.defaultSession, persistedState.settings.proxy).then(
    () => {
      registerStorageIpc({
        onSettingsChanged: (settings) =>
          applyProxySettings(session.defaultSession, settings.proxy),
      });
      ipcMain.handle('player:launch', (_event, input: LaunchMpvInput) =>
        mpvController.launch(input, readPersistedState().settings.proxy)
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
