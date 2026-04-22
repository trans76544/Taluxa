import { app, BrowserWindow, ipcMain } from 'electron';
import { registerStorageIpc } from './ipc/storage';
import { MpvController, type LaunchMpvInput } from './player/mpvController';
import { createMainWindow } from './window';

const mpvController = new MpvController({ isPackaged: app.isPackaged });

app.whenReady().then(() => {
  registerStorageIpc();
  ipcMain.handle('player:launch', (_event, input: LaunchMpvInput) =>
    mpvController.launch(input)
  );
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
