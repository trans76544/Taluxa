import { BrowserWindow } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createMainWindow() {
  const mainWindow = new BrowserWindow({
    title: 'Taluxa',
    width: 1280,
    height: 800,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b1020',
    icon: join(__dirname, '../../sources/icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: join(__dirname, '../preload/index.mjs'),
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
