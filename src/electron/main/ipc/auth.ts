import { ipcMain } from 'electron';
import { login, type EmbyLoginInput } from '../../../shared/api/emby/auth';
import type { EmbyFetch } from '../../../shared/api/emby/client';

export function registerAuthIpc(fetcher: EmbyFetch) {
  ipcMain.handle('auth:login', (_event, input: EmbyLoginInput) => login(input, fetcher));
}
