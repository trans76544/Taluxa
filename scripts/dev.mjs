import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_DEV_HOST,
  DEFAULT_DEV_PORT,
  findAvailablePort,
  parsePort,
} from './devServerPort.mjs';

const host = process.env.VITE_HOST || DEFAULT_DEV_HOST;
const preferredPort = parsePort(process.env.VITE_PORT, DEFAULT_DEV_PORT);
const port = await findAvailablePort({
  host,
  startPort: preferredPort,
});
const viteCliPath = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const passthroughArgs = process.argv.slice(2);
const viteArgs = [...passthroughArgs, '--host', host, '--port', String(port)];

console.log(`[dev] Starting Vite on http://${host}:${port}`);

const child = spawn(process.execPath, [viteCliPath, ...viteArgs], {
  stdio: 'inherit',
  shell: false,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(`[dev] Failed to start Vite: ${error.message}`);
  process.exit(1);
});
