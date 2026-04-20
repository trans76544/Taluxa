import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('embyDesktop', {
  ping: () => 'pong',
});
