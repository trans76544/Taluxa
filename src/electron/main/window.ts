import { BrowserWindow } from 'electron';
import { join } from 'node:path';

export function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#0b1020',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, '../preload/index.js'),
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
    return mainWindow;
  }

  void mainWindow.loadFile(join(__dirname, '../../dist/index.html'));
  return mainWindow;
}
