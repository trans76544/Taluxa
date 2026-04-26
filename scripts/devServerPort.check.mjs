import assert from 'node:assert/strict';
import { findAvailablePort } from './devServerPort.mjs';

async function testReturnsFirstAvailablePort() {
  const checkedPorts = [];

  const port = await findAvailablePort({
    host: '127.0.0.1',
    startPort: 5173,
    maxAttempts: 4,
    canListenToPort: async (candidatePort) => {
      checkedPorts.push(candidatePort);

      return {
        available: candidatePort === 5175,
      };
    },
  });

  assert.equal(port, 5175);
  assert.deepEqual(checkedPorts, [5173, 5174, 5175]);
}

async function testThrowsWhenNoCandidatePortIsAvailable() {
  await assert.rejects(
    () =>
      findAvailablePort({
        host: '127.0.0.1',
        startPort: 5173,
        maxAttempts: 2,
        canListenToPort: async () => ({ available: false }),
      }),
    /No available port found/
  );
}

await testReturnsFirstAvailablePort();
await testThrowsWhenNoCandidatePortIsAvailable();

console.log('devServerPort tests passed');
