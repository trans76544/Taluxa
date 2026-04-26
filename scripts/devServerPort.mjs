import net from 'node:net';

export const DEFAULT_DEV_HOST = '127.0.0.1';
export const DEFAULT_DEV_PORT = 5173;
export const DEFAULT_MAX_PORT_ATTEMPTS = 200;

export function parsePort(value, fallback = DEFAULT_DEV_PORT) {
  const port = Number.parseInt(value, 10);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return fallback;
  }

  return port;
}

export function canListen(port, host = DEFAULT_DEV_HOST) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (error) => {
      resolve({
        available: false,
        error,
      });
    });

    server.once('listening', () => {
      server.close(() => {
        resolve({
          available: true,
        });
      });
    });

    server.listen({
      host,
      port,
      exclusive: true,
    });
  });
}

export async function findAvailablePort({
  host = DEFAULT_DEV_HOST,
  startPort = DEFAULT_DEV_PORT,
  maxAttempts = DEFAULT_MAX_PORT_ATTEMPTS,
  canListenToPort = canListen,
} = {}) {
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const port = startPort + offset;

    if (port > 65535) {
      break;
    }

    const result = await canListenToPort(port, host);

    if (result.available) {
      return port;
    }
  }

  throw new Error(`No available port found for ${host} from ${startPort} after ${maxAttempts} attempts.`);
}
