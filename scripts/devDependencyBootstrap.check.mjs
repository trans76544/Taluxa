import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { ensureDevDependencies } from '../scripts/devDependencyBootstrap.mjs';

function createChild({ code = 0, error = null, signal = null } = {}) {
  const child = new EventEmitter();
  queueMicrotask(() => error ? child.emit('error', error) : child.emit('close', code, signal));
  return child;
}

function createScenario({
  installResult = {}, lockfileExists = true,
  repositoryRoot = 'C:\\Project With Space\\Taluxa',
  toolInitiallyExists = false, toolExistsAfterInstall = true,
  nodeExecutable = 'C:\\Node Runtime\\node.exe',
  npmExecPath = 'C:\\Node Runtime\\node_modules\\npm\\bin\\npm-cli.js',
} = {}) {
  const requiredToolPath = path.join(repositoryRoot, 'node_modules', 'vite', 'bin', 'vite.js');
  const lockfilePath = path.join(repositoryRoot, 'package-lock.json');
  const existenceChecks = [];
  const spawnCalls = [];
  let toolChecks = 0;

  const exists = (candidatePath) => {
    existenceChecks.push(candidatePath);
    if (candidatePath === lockfilePath) return lockfileExists;
    if (candidatePath === requiredToolPath) {
      toolChecks += 1;
      return toolChecks === 1 ? toolInitiallyExists : toolExistsAfterInstall;
    }
    return false;
  };

  const spawnProcess = (command, args, options) => {
    spawnCalls.push({ command, args, options });
    return createChild(installResult);
  };

  return { existenceChecks, exists, lockfilePath, nodeExecutable, npmExecPath, repositoryRoot, requiredToolPath, spawnCalls, spawnProcess };
}

async function testInstallsLockedDependenciesThroughCurrentNpmCli() {
  const scenario = createScenario();
  await ensureDevDependencies(scenario);
  assert.deepEqual(scenario.spawnCalls, [{
    command: scenario.nodeExecutable,
    args: [scenario.npmExecPath, 'ci'],
    options: { cwd: scenario.repositoryRoot, shell: false, stdio: 'inherit' },
  }]);
  assert.deepEqual(scenario.existenceChecks, [scenario.requiredToolPath, scenario.lockfilePath, scenario.requiredToolPath]);
}

async function testSupportsNonWindowsRepositoryPaths() {
  const scenario = createScenario({
    nodeExecutable: '/opt/node/bin/node',
    npmExecPath: '/opt/node/lib/node_modules/npm/bin/npm-cli.js',
    repositoryRoot: '/tmp/Taluxa Clone',
  });
  await ensureDevDependencies(scenario);
  assert.equal(scenario.spawnCalls[0].command, '/opt/node/bin/node');
  assert.deepEqual(scenario.spawnCalls[0].args, ['/opt/node/lib/node_modules/npm/bin/npm-cli.js', 'ci']);
  assert.equal(scenario.spawnCalls[0].options.cwd, '/tmp/Taluxa Clone');
}

async function testSkipsInstallWhenToolAlreadyExists() {
  const scenario = createScenario({ toolInitiallyExists: true, npmExecPath: undefined });
  const startedAt = performance.now();
  await ensureDevDependencies(scenario);
  assert.equal(scenario.spawnCalls.length, 0);
  assert.deepEqual(scenario.existenceChecks, [scenario.requiredToolPath]);
  assert.ok(performance.now() - startedAt < 100, 'installed fast path must finish within 100 ms');
}

async function testRejectsMissingLockfile() {
  const scenario = createScenario({ lockfileExists: false });
  await assert.rejects(() => ensureDevDependencies(scenario), /package-lock\.json.*npm ci/i);
  assert.equal(scenario.spawnCalls.length, 0);
}

async function testRejectsMissingNpmExecPath() {
  const scenario = createScenario({ npmExecPath: null });
  await assert.rejects(() => ensureDevDependencies(scenario), /npm_execpath.*npm run dev/i);
  assert.equal(scenario.spawnCalls.length, 0);
}

async function testRejectsSpawnError() {
  const scenario = createScenario({ installResult: { error: new Error('npm unavailable') } });
  await assert.rejects(() => ensureDevDependencies(scenario), /Failed to start npm ci.*npm unavailable/i);
}

async function testRejectsNonzeroExit() {
  const scenario = createScenario({ installResult: { code: 17 } });
  await assert.rejects(() => ensureDevDependencies(scenario), /npm ci failed with exit code 17/i);
}

async function testRejectsSignalTermination() {
  const scenario = createScenario({ installResult: { code: null, signal: 'SIGTERM' } });
  await assert.rejects(() => ensureDevDependencies(scenario), /npm ci terminated by signal SIGTERM/i);
}

async function testRejectsMissingToolAfterSuccessfulInstall() {
  const scenario = createScenario({ toolExistsAfterInstall: false });
  await assert.rejects(() => ensureDevDependencies(scenario), /Vite is still unavailable.*npm ci/i);
}

await testInstallsLockedDependenciesThroughCurrentNpmCli();
await testSupportsNonWindowsRepositoryPaths();
await testSkipsInstallWhenToolAlreadyExists();
await testRejectsMissingLockfile();
await testRejectsMissingNpmExecPath();
await testRejectsSpawnError();
await testRejectsNonzeroExit();
await testRejectsSignalTermination();
await testRejectsMissingToolAfterSuccessfulInstall();
console.log('devDependencyBootstrap tests passed');
