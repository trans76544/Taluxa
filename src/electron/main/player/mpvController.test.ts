// @vitest-environment node

import { EventEmitter } from 'node:events';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MpvController,
  type LaunchMpvInput,
  type MpvProgressSnapshot,
  type SpawnedMpvProcess,
} from './mpvController';

class FakeSpawnedProcess extends EventEmitter implements SpawnedMpvProcess {
  readonly unref = vi.fn();
}

class FakeIpcClient extends EventEmitter {
  readonly destroy = vi.fn();

  readonly setEncoding = vi.fn();

  readonly write = vi.fn();
}

describe('MpvController', () => {
  const repoRoot = path.join('G:', 'JSProject', 'Emby_Player', '.worktrees', 'mpv-ui-sort-fallback');
  const devModuleDir = path.join(repoRoot, 'src', 'electron', 'main', 'player');
  const packagedResourcesPath = path.join('C:', 'Program Files', 'Emby Player', 'resources');
  const ipcServerPath = String.raw`\\.\pipe\emby-player-session-1`;

  let existingPaths: Set<string>;

  beforeEach(() => {
    existingPaths = new Set<string>();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createController(overrides: Partial<ConstructorParameters<typeof MpvController>[0]> = {}) {
    return new MpvController({
      fileExists: (targetPath) => existingPaths.has(targetPath),
      ...overrides,
    });
  }

  function createLaunchInput(overrides: Partial<LaunchMpvInput> = {}): LaunchMpvInput {
    return {
      itemId: 'item-1',
      streamUrl: 'https://example.com/stream.m3u8',
      title: 'Episode 1',
      startSeconds: 12,
      ...overrides,
    };
  }

  it('resolves the bundled executable from packaged resources', () => {
    const expectedPath = path.join(
      packagedResourcesPath,
      'vendor',
      'mpv',
      'windows-x64',
      'mpv.exe'
    );
    existingPaths.add(expectedPath);

    const controller = createController({
      isPackaged: true,
      resourcesPath: packagedResourcesPath,
    });

    expect(controller.getExecutablePath()).toBe(expectedPath);
  });

  it('resolves the bundled executable from the workspace in development', () => {
    const expectedPath = path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
    existingPaths.add(path.join(repoRoot, 'package.json'));
    existingPaths.add(expectedPath);

    const controller = createController({
      isPackaged: false,
      moduleDir: devModuleDir,
    });

    expect(controller.getExecutablePath()).toBe(expectedPath);
  });

  it('launches mpv with the expected window and playback arguments', async () => {
    const expectedPath = path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
    const child = new FakeSpawnedProcess();
    const ipcClient = new FakeIpcClient();
    const spawnProcess = vi.fn(() => child);
    const connectIpc = vi.fn(() => ipcClient);
    existingPaths.add(path.join(repoRoot, 'package.json'));
    existingPaths.add(expectedPath);

    const controller = createController({
      connectIpc,
      moduleDir: devModuleDir,
      spawnProcess,
      createIpcEndpoint: () => ipcServerPath,
    });

    const launchPromise = controller.launch(createLaunchInput({ startSeconds: -5 }));
    child.emit('spawn');
    ipcClient.emit('connect');

    await expect(launchPromise).resolves.toBeUndefined();
    expect(spawnProcess).toHaveBeenCalledWith(
      expectedPath,
      [
        '--force-window=yes',
        `--input-ipc-server=${ipcServerPath}`,
        '--title=Episode 1',
        '--start=0',
        'https://example.com/stream.m3u8',
      ],
      {
        stdio: 'ignore',
        windowsHide: true,
      }
    );
    expect(child.unref).toHaveBeenCalledTimes(1);
  });

  it('rejects when the bundled runtime is missing', async () => {
    existingPaths.add(path.join(repoRoot, 'package.json'));

    const controller = createController({
      moduleDir: devModuleDir,
    });

    await expect(controller.launch(createLaunchInput())).rejects.toThrow(
      /Bundled mpv runtime was not found/
    );
  });

  it('rejects when mpv emits a spawn error', async () => {
    const expectedPath = path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
    const child = new FakeSpawnedProcess();
    const spawnProcess = vi.fn(() => child);
    existingPaths.add(path.join(repoRoot, 'package.json'));
    existingPaths.add(expectedPath);

    const controller = createController({
      moduleDir: devModuleDir,
      spawnProcess,
    });

    const launchPromise = controller.launch(createLaunchInput());
    child.emit('error', new Error('spawn failed'));

    await expect(launchPromise).rejects.toThrow('spawn failed');
  });

  it('observes mpv playback properties and emits progress snapshots', async () => {
    const expectedPath = path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
    const child = new FakeSpawnedProcess();
    const ipcClient = new FakeIpcClient();
    const spawnProcess = vi.fn(() => child);
    const connectIpc = vi.fn(() => ipcClient);
    const onProgress = vi.fn<(snapshot: MpvProgressSnapshot) => void>();
    existingPaths.add(path.join(repoRoot, 'package.json'));
    existingPaths.add(expectedPath);

    const controller = createController({
      moduleDir: devModuleDir,
      spawnProcess,
      connectIpc,
      createIpcEndpoint: () => ipcServerPath,
      onProgress,
    });

    const launchPromise = controller.launch(createLaunchInput({ itemId: 'episode-1' }));
    child.emit('spawn');
    ipcClient.emit('connect');
    await expect(launchPromise).resolves.toBeUndefined();

    expect(connectIpc).toHaveBeenCalledWith(ipcServerPath);

    expect(ipcClient.write).toHaveBeenNthCalledWith(
      1,
      `${JSON.stringify({ command: ['observe_property', 1, 'time-pos'] })}\n`
    );
    expect(ipcClient.write).toHaveBeenNthCalledWith(
      2,
      `${JSON.stringify({ command: ['observe_property', 2, 'duration'] })}\n`
    );

    ipcClient.emit(
      'data',
      Buffer.from(`${JSON.stringify({ event: 'property-change', name: 'duration', data: 180 })}\n`)
    );
    expect(onProgress).not.toHaveBeenCalled();

    ipcClient.emit(
      'data',
      Buffer.from(`${JSON.stringify({ event: 'property-change', name: 'time-pos', data: 12.7 })}\n`)
    );

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenLastCalledWith({
      itemId: 'episode-1',
      positionSeconds: 12,
      durationSeconds: 180,
    });
  });

  it('retries retryable ipc connection failures after the first socket closes', async () => {
    vi.useFakeTimers();
    const expectedPath = path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
    const child = new FakeSpawnedProcess();
    const firstIpcClient = new FakeIpcClient();
    const secondIpcClient = new FakeIpcClient();
    const spawnProcess = vi.fn(() => child);
    const connectIpc = vi
      .fn<() => FakeIpcClient>()
      .mockReturnValueOnce(firstIpcClient)
      .mockReturnValueOnce(secondIpcClient);
    const onProgress = vi.fn<(snapshot: MpvProgressSnapshot) => void>();
    existingPaths.add(path.join(repoRoot, 'package.json'));
    existingPaths.add(expectedPath);

    const controller = createController({
      moduleDir: devModuleDir,
      spawnProcess,
      connectIpc,
      connectRetryDelayMs: 50,
      createIpcEndpoint: () => ipcServerPath,
      onProgress,
    });

    const launchPromise = controller.launch(createLaunchInput({ itemId: 'episode-2' }));
    child.emit('spawn');

    const retryableError = Object.assign(new Error('pipe not ready'), { code: 'ENOENT' });

    firstIpcClient.emit('error', retryableError);
    firstIpcClient.emit('close');

    await vi.advanceTimersByTimeAsync(50);

    expect(connectIpc).toHaveBeenCalledTimes(2);
    secondIpcClient.emit('connect');
    await expect(launchPromise).resolves.toBeUndefined();
    secondIpcClient.emit(
      'data',
      Buffer.from(`${JSON.stringify({ event: 'property-change', name: 'duration', data: 240 })}\n`)
    );
    secondIpcClient.emit(
      'data',
      Buffer.from(`${JSON.stringify({ event: 'property-change', name: 'time-pos', data: 18.4 })}\n`)
    );

    expect(secondIpcClient.write).toHaveBeenNthCalledWith(
      1,
      `${JSON.stringify({ command: ['observe_property', 1, 'time-pos'] })}\n`
    );
    expect(secondIpcClient.write).toHaveBeenNthCalledWith(
      2,
      `${JSON.stringify({ command: ['observe_property', 2, 'duration'] })}\n`
    );
    expect(onProgress).toHaveBeenCalledWith({
      itemId: 'episode-2',
      positionSeconds: 18,
      durationSeconds: 240,
    });
  });

  it('rejects when mpv exits before the IPC bridge becomes ready', async () => {
    const expectedPath = path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
    const child = new FakeSpawnedProcess();
    const ipcClient = new FakeIpcClient();
    const spawnProcess = vi.fn(() => child);
    const connectIpc = vi.fn(() => ipcClient);
    existingPaths.add(path.join(repoRoot, 'package.json'));
    existingPaths.add(expectedPath);

    const controller = createController({
      connectIpc,
      moduleDir: devModuleDir,
      spawnProcess,
      createIpcEndpoint: () => ipcServerPath,
    });

    const launchPromise = controller.launch(createLaunchInput());
    child.emit('spawn');
    child.emit('exit', 1, null);

    await expect(launchPromise).rejects.toThrow(/before playback became ready/i);
  });

  it('rejects when mpv readiness times out before IPC connects', async () => {
    vi.useFakeTimers();
    const expectedPath = path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
    const child = new FakeSpawnedProcess();
    const ipcClient = new FakeIpcClient();
    const spawnProcess = vi.fn(() => child);
    const connectIpc = vi.fn(() => ipcClient);
    existingPaths.add(path.join(repoRoot, 'package.json'));
    existingPaths.add(expectedPath);

    const controller = createController({
      connectIpc,
      connectRetryDelayMs: 50,
      moduleDir: devModuleDir,
      spawnProcess,
      createIpcEndpoint: () => ipcServerPath,
      connectTimeoutMs: 200,
    });

    const launchPromise = controller.launch(createLaunchInput());
    child.emit('spawn');
    const timeoutAssertion = expect(launchPromise).rejects.toThrow(/timed out/i);

    await vi.advanceTimersByTimeAsync(200);
    await timeoutAssertion;
  });
});
