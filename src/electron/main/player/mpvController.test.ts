// @vitest-environment node

import { EventEmitter } from 'node:events';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MpvController,
  type LaunchMpvInput,
  type SpawnedMpvProcess,
} from './mpvController';

class FakeSpawnedProcess extends EventEmitter implements SpawnedMpvProcess {
  readonly unref = vi.fn();
}

describe('MpvController', () => {
  const repoRoot = path.join('G:', 'JSProject', 'Emby_Player', '.worktrees', 'mpv-ui-sort-fallback');
  const devModuleDir = path.join(repoRoot, 'src', 'electron', 'main', 'player');
  const packagedResourcesPath = path.join('C:', 'Program Files', 'Emby Player', 'resources');

  let existingPaths: Set<string>;

  beforeEach(() => {
    existingPaths = new Set<string>();
  });

  function createController(overrides: Partial<ConstructorParameters<typeof MpvController>[0]> = {}) {
    return new MpvController({
      fileExists: (targetPath) => existingPaths.has(targetPath),
      ...overrides,
    });
  }

  function createLaunchInput(overrides: Partial<LaunchMpvInput> = {}): LaunchMpvInput {
    return {
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
    const spawnProcess = vi.fn(() => child);
    existingPaths.add(path.join(repoRoot, 'package.json'));
    existingPaths.add(expectedPath);

    const controller = createController({
      moduleDir: devModuleDir,
      spawnProcess,
    });

    const launchPromise = controller.launch(createLaunchInput({ startSeconds: -5 }));
    child.emit('spawn');

    await expect(launchPromise).resolves.toBeUndefined();
    expect(spawnProcess).toHaveBeenCalledWith(
      expectedPath,
      [
        '--force-window=yes',
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
});
