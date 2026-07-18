import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

function waitForInstaller(child) {
  return new Promise((resolve, reject) => {
    child.once('error', (error) => {
      reject(new Error(`Failed to start npm ci: ${error.message}`, { cause: error }));
    });
    child.once('close', (code, signal) => {
      if (signal) {
        reject(new Error(`npm ci terminated by signal ${signal}.`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`npm ci failed with exit code ${String(code)}.`));
        return;
      }
      resolve();
    });
  });
}

export async function ensureDevDependencies({
  repositoryRoot,
  requiredToolPath = path.join(repositoryRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
  lockfilePath = path.join(repositoryRoot, 'package-lock.json'),
  nodeExecutable = process.execPath,
  npmExecPath = process.env.npm_execpath,
  exists = existsSync,
  spawnProcess = spawn,
  log = console.log,
}) {
  if (exists(requiredToolPath)) return;

  if (!exists(lockfilePath)) {
    throw new Error(`package-lock.json is missing at ${lockfilePath}; cannot run npm ci deterministically.`);
  }

  if (!npmExecPath) {
    throw new Error('npm_execpath is unavailable. Start the project with npm run dev so locked dependencies can be installed.');
  }

  log('[dev] Local Vite dependency is missing; installing locked dependencies with npm ci...');

  let child;
  try {
    child = spawnProcess(nodeExecutable, [npmExecPath, 'ci'], {
      cwd: repositoryRoot,
      shell: false,
      stdio: 'inherit',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to start npm ci: ${message}`, { cause: error });
  }

  await waitForInstaller(child);

  if (!exists(requiredToolPath)) {
    throw new Error(`Vite is still unavailable at ${requiredToolPath} after npm ci completed.`);
  }
}
