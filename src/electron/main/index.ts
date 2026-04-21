import { app, BrowserWindow } from 'electron';
import { registerStorageIpc } from './ipc/storage';
import { createMainWindow } from './window';

app.whenReady().then(() => {
  registerStorageIpc();
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
