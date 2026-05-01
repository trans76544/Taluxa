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
import type { ProxySettings } from '@shared/models/settings';

class FakeSpawnedProcess extends EventEmitter implements SpawnedMpvProcess {
  readonly stderr = new EventEmitter();

  readonly kill = vi.fn();

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
  const inputConfigPath = path.join(repoRoot, 'mpv-input.conf');
  const uiScriptPath = path.join(repoRoot, 'mpv-taluxa-ui.lua');
  const danmakuAssPath = path.join(repoRoot, 'mpv-danmaku.ass');
  const logFilePath = path.join(repoRoot, 'mpv.log');
  const packagedResourcesPath = path.join('C:', 'Program Files', 'Taluxa', 'resources');
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
      createInputConfigFilePath: () => inputConfigPath,
      createUiScriptFilePath: () => uiScriptPath,
      createLogFilePath: () => logFilePath,
      fileExists: (targetPath) => existingPaths.has(targetPath),
      writeTextFile: () => undefined,
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

  function createProxySettings(overrides: Partial<ProxySettings> = {}): ProxySettings {
    return {
      mode: 'system',
      customProxyUrl: '',
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

    const launchPromise = controller.launch(
      createLaunchInput({ startSeconds: -5 }),
      createProxySettings()
    );
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));

    await expect(launchPromise).resolves.toBeUndefined();
    expect(spawnProcess).toHaveBeenCalledWith(
      expectedPath,
      [
        '--force-window=yes',
        '--border=no',
        '--osc=no',
        `--input-ipc-server=${ipcServerPath}`,
        `--input-conf=${inputConfigPath}`,
        `--script=${uiScriptPath}`,
        '--title=Episode 1',
        '--start=0',
        '--osd-font=Microsoft YaHei UI',
        '--osd-duration=1500',
        '--cache=yes',
        '--cache-secs=120',
        '--msg-level=all=v',
        `--log-file=${logFilePath}`,
        '--ytdl=no',
        'https://example.com/stream.m3u8',
      ],
      {
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
      }
    );
    expect(child.unref).toHaveBeenCalledTimes(1);
  });

  it('loads a generated ASS danmaku subtitle file when comments are available', async () => {
    const expectedPath = path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
    const child = new FakeSpawnedProcess();
    const ipcClient = new FakeIpcClient();
    const spawnProcess = vi.fn(() => child);
    const connectIpc = vi.fn(() => ipcClient);
    const writeTextFile = vi.fn();
    existingPaths.add(path.join(repoRoot, 'package.json'));
    existingPaths.add(expectedPath);

    const controller = createController({
      connectIpc,
      moduleDir: devModuleDir,
      spawnProcess,
      createIpcEndpoint: () => ipcServerPath,
      createDanmakuFilePath: () => danmakuAssPath,
      fetchDanmaku: vi.fn().mockResolvedValue([
        { color: 16777215, mode: 'scroll', text: 'hello', timeSeconds: 12 },
      ]),
      writeTextFile,
    });

    const launchPromise = controller.launch(
      createLaunchInput(),
      createProxySettings(),
      [
        {
          id: 'official',
          name: 'Official',
          url: 'https://api.dandanplay.net',
          enabled: true,
        },
      ]
    );
    await Promise.resolve();
    await Promise.resolve();
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));

    await expect(launchPromise).resolves.toBeUndefined();
    expect(writeTextFile).toHaveBeenCalledWith(
      danmakuAssPath,
      expect.stringContaining('Dialogue: 0,0:00:12.00')
    );
    expect(spawnProcess).toHaveBeenCalledWith(
      expectedPath,
      expect.arrayContaining([`--sub-file=${danmakuAssPath}`]),
      expect.any(Object)
    );
  });

  it('launches mpv with the custom Taluxa in-player control layer', async () => {
    const expectedPath = path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
    const inputConfigPath = path.join(repoRoot, 'mpv-input.conf');
    const uiScriptPath = path.join(repoRoot, 'mpv-taluxa-ui.lua');
    const child = new FakeSpawnedProcess();
    const ipcClient = new FakeIpcClient();
    const spawnProcess = vi.fn(() => child);
    const connectIpc = vi.fn(() => ipcClient);
    const writeTextFile = vi.fn();
    existingPaths.add(path.join(repoRoot, 'package.json'));
    existingPaths.add(expectedPath);

    const controller = createController({
      connectIpc,
      moduleDir: devModuleDir,
      spawnProcess,
      createIpcEndpoint: () => ipcServerPath,
      createInputConfigFilePath: () => inputConfigPath,
      createUiScriptFilePath: () => uiScriptPath,
      writeTextFile,
    });

    const launchPromise = controller.launch(
      createLaunchInput({ title: 'Bocchi the Rock! - S1:E1 - Lonely Turn' }),
      createProxySettings()
    );
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));

    await expect(launchPromise).resolves.toBeUndefined();
    expect(writeTextFile).toHaveBeenCalledWith(
      inputConfigPath,
      expect.stringContaining('F6 cycle-values speed 0.5 0.75 1 1.25 1.5 2 3 4 5')
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      inputConfigPath,
      expect.stringContaining('F10 add cache-secs 30')
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      uiScriptPath,
      expect.stringContaining('[=[Bocchi the Rock!]=]')
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      uiScriptPath,
      expect.stringContaining('[=[S1:E1 - Lonely Turn]=]')
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      uiScriptPath,
      expect.stringContaining("mp.observe_property('cache-speed'")
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      uiScriptPath,
      expect.stringContaining('local function draw_controls()')
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      uiScriptPath,
      expect.stringContaining('local function handle_click()')
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      uiScriptPath,
      expect.stringContaining("mp.add_forced_key_binding('MBTN_LEFT'")
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      uiScriptPath,
      expect.stringContaining('local UI_WIDTH = 1920')
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      uiScriptPath,
      expect.stringContaining('local function normalize_mouse_pos(pos)')
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      uiScriptPath,
      expect.stringContaining("append_box(out, 0, height - 210, width, bottom, '000000', 130)")
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      uiScriptPath,
      expect.not.stringContaining("append_box(out, 0, height - 148")
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      uiScriptPath,
      expect.stringContaining('local BUTTON_SCALE = 2')
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      uiScriptPath,
      expect.stringContaining('local window_button_width = 28 * BUTTON_SCALE')
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      uiScriptPath,
      expect.stringContaining("add_button(out, 'close', width - 76, 8, window_button_width")
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      uiScriptPath,
      expect.stringContaining("local function draw_options_menu(out)")
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      uiScriptPath,
      expect.stringContaining("menu_open = 'speed'")
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      uiScriptPath,
      expect.stringContaining("menu_open = 'audio'")
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      uiScriptPath,
      expect.stringContaining('Danmaku/subtitles toggled')
    );
    expect(spawnProcess).toHaveBeenCalledWith(
      expectedPath,
      expect.arrayContaining([
        '--border=no',
        '--osc=no',
        `--input-conf=${inputConfigPath}`,
        `--script=${uiScriptPath}`,
        '--cache=yes',
        '--cache-secs=120',
      ]),
      expect.any(Object)
    );
  });

  it('passes playback http headers through to mpv', async () => {
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

    const launchPromise = controller.launch(
      createLaunchInput({
        httpHeaders: {
          Authorization: 'MediaBrowser Token="token-123"',
          'X-Emby-Token': 'token-123',
        },
      }),
      createProxySettings()
    );
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));

    await expect(launchPromise).resolves.toBeUndefined();
    expect(spawnProcess).toHaveBeenCalledWith(
      expectedPath,
      [
        '--force-window=yes',
        '--border=no',
        '--osc=no',
        `--input-ipc-server=${ipcServerPath}`,
        `--input-conf=${inputConfigPath}`,
        `--script=${uiScriptPath}`,
        '--title=Episode 1',
        '--start=12',
        '--osd-font=Microsoft YaHei UI',
        '--osd-duration=1500',
        '--cache=yes',
        '--cache-secs=120',
        '--msg-level=all=v',
        `--log-file=${logFilePath}`,
        '--ytdl=no',
        '--http-header-fields=Authorization: MediaBrowser Token="token-123",X-Emby-Token: token-123',
        '--demuxer-lavf-o=headers=Authorization: MediaBrowser Token="token-123"\r\nX-Emby-Token: token-123\r\n',
        'https://example.com/stream.m3u8',
      ],
      {
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
      }
    );
  });

  it('does not add proxy arguments when proxy mode is system', async () => {
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

    const launchPromise = controller.launch(createLaunchInput(), createProxySettings());
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));

    await expect(launchPromise).resolves.toBeUndefined();
    expect(spawnProcess).toHaveBeenCalledWith(
      expectedPath,
      [
        '--force-window=yes',
        '--border=no',
        '--osc=no',
        `--input-ipc-server=${ipcServerPath}`,
        `--input-conf=${inputConfigPath}`,
        `--script=${uiScriptPath}`,
        '--title=Episode 1',
        '--start=12',
        '--osd-font=Microsoft YaHei UI',
        '--osd-duration=1500',
        '--cache=yes',
        '--cache-secs=120',
        '--msg-level=all=v',
        `--log-file=${logFilePath}`,
        '--ytdl=no',
        'https://example.com/stream.m3u8',
      ],
      {
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
      }
    );
  });

  it('clears mpv http proxy when proxy mode is direct', async () => {
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

    const launchPromise = controller.launch(
      createLaunchInput(),
      createProxySettings({ mode: 'direct' })
    );
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));

    await expect(launchPromise).resolves.toBeUndefined();
    expect(spawnProcess).toHaveBeenCalledWith(
      expectedPath,
      [
        '--force-window=yes',
        '--border=no',
        '--osc=no',
        `--input-ipc-server=${ipcServerPath}`,
        `--input-conf=${inputConfigPath}`,
        `--script=${uiScriptPath}`,
        '--title=Episode 1',
        '--start=12',
        '--osd-font=Microsoft YaHei UI',
        '--osd-duration=1500',
        '--cache=yes',
        '--cache-secs=120',
        '--msg-level=all=v',
        `--log-file=${logFilePath}`,
        '--ytdl=no',
        '--http-proxy=',
        'https://example.com/stream.m3u8',
      ],
      {
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
      }
    );
  });

  it('adds a custom http proxy when proxy mode is custom', async () => {
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

    const launchPromise = controller.launch(
      createLaunchInput(),
      createProxySettings({
        mode: 'custom',
        customProxyUrl: 'http://127.0.0.1:7890',
      })
    );
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));

    await expect(launchPromise).resolves.toBeUndefined();
    expect(spawnProcess).toHaveBeenCalledWith(
      expectedPath,
      [
        '--force-window=yes',
        '--border=no',
        '--osc=no',
        `--input-ipc-server=${ipcServerPath}`,
        `--input-conf=${inputConfigPath}`,
        `--script=${uiScriptPath}`,
        '--title=Episode 1',
        '--start=12',
        '--osd-font=Microsoft YaHei UI',
        '--osd-duration=1500',
        '--cache=yes',
        '--cache-secs=120',
        '--msg-level=all=v',
        `--log-file=${logFilePath}`,
        '--ytdl=no',
        '--http-proxy=http://127.0.0.1:7890',
        'https://example.com/stream.m3u8',
      ],
      {
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
      }
    );
  });

  it('clears mpv http proxy for local playback proxy urls even when a custom proxy is configured', async () => {
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

    const launchPromise = controller.launch(
      createLaunchInput({
        streamUrl: 'http://127.0.0.1:12066/hls/source-1?url=https%3A%2F%2Fdemo.emby.local',
      }),
      createProxySettings({
        mode: 'custom',
        customProxyUrl: 'http://127.0.0.1:20122',
      })
    );
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));

    await expect(launchPromise).resolves.toBeUndefined();
    expect(spawnProcess).toHaveBeenCalledWith(
      expectedPath,
      [
        '--force-window=yes',
        '--border=no',
        '--osc=no',
        `--input-ipc-server=${ipcServerPath}`,
        `--input-conf=${inputConfigPath}`,
        `--script=${uiScriptPath}`,
        '--title=Episode 1',
        '--start=12',
        '--osd-font=Microsoft YaHei UI',
        '--osd-duration=1500',
        '--cache=yes',
        '--cache-secs=120',
        '--msg-level=all=v',
        `--log-file=${logFilePath}`,
        '--ytdl=no',
        '--http-proxy=',
        'http://127.0.0.1:12066/hls/source-1?url=https%3A%2F%2Fdemo.emby.local',
      ],
      {
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
      }
    );
  });

  it('does not add a custom proxy argument for an invalid legacy custom proxy value', async () => {
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

    const launchPromise = controller.launch(
      createLaunchInput(),
      createProxySettings({
        mode: 'custom',
        customProxyUrl: '127.0.0.1:7890',
      })
    );
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));

    await expect(launchPromise).resolves.toBeUndefined();
    expect(spawnProcess).toHaveBeenCalledWith(
      expectedPath,
      [
        '--force-window=yes',
        '--border=no',
        '--osc=no',
        `--input-ipc-server=${ipcServerPath}`,
        `--input-conf=${inputConfigPath}`,
        `--script=${uiScriptPath}`,
        '--title=Episode 1',
        '--start=12',
        '--osd-font=Microsoft YaHei UI',
        '--osd-duration=1500',
        '--cache=yes',
        '--cache-secs=120',
        '--msg-level=all=v',
        `--log-file=${logFilePath}`,
        '--ytdl=no',
        'https://example.com/stream.m3u8',
      ],
      {
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
      }
    );
  });

  it('trims whitespace from a valid custom proxy before passing it to mpv', async () => {
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

    const launchPromise = controller.launch(
      createLaunchInput(),
      createProxySettings({
        mode: 'custom',
        customProxyUrl: '  http://127.0.0.1:7890  ',
      })
    );
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));

    await expect(launchPromise).resolves.toBeUndefined();
    expect(spawnProcess).toHaveBeenCalledWith(
      expectedPath,
      [
        '--force-window=yes',
        '--border=no',
        '--osc=no',
        `--input-ipc-server=${ipcServerPath}`,
        `--input-conf=${inputConfigPath}`,
        `--script=${uiScriptPath}`,
        '--title=Episode 1',
        '--start=12',
        '--osd-font=Microsoft YaHei UI',
        '--osd-duration=1500',
        '--cache=yes',
        '--cache-secs=120',
        '--msg-level=all=v',
        `--log-file=${logFilePath}`,
        '--ytdl=no',
        '--http-proxy=http://127.0.0.1:7890',
        'https://example.com/stream.m3u8',
      ],
      {
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
      }
    );
  });

  it('rejects when the bundled runtime is missing', async () => {
    existingPaths.add(path.join(repoRoot, 'package.json'));

    const controller = createController({
      moduleDir: devModuleDir,
    });

    await expect(controller.launch(createLaunchInput(), createProxySettings())).rejects.toThrow(
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

    const launchPromise = controller.launch(createLaunchInput(), createProxySettings());
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

    const launchPromise = controller.launch(
      createLaunchInput({ itemId: 'episode-1' }),
      createProxySettings()
    );
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));
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

    const launchPromise = controller.launch(
      createLaunchInput({ itemId: 'episode-2' }),
      createProxySettings()
    );
    child.emit('spawn');

    const retryableError = Object.assign(new Error('pipe not ready'), { code: 'ENOENT' });

    firstIpcClient.emit('error', retryableError);
    firstIpcClient.emit('close');

    await vi.advanceTimersByTimeAsync(50);

    expect(connectIpc).toHaveBeenCalledTimes(2);
    secondIpcClient.emit('connect');
    secondIpcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));
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

    const launchPromise = controller.launch(createLaunchInput(), createProxySettings());
    child.emit('spawn');
    child.emit('exit', 1, null);

    await expect(launchPromise).rejects.toThrow(/before playback became ready/i);
  });

  it('terminates the previous mpv process when launching another playback session', async () => {
    const expectedPath = path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
    const firstChild = new FakeSpawnedProcess();
    const secondChild = new FakeSpawnedProcess();
    const firstIpcClient = new FakeIpcClient();
    const secondIpcClient = new FakeIpcClient();
    const spawnProcess = vi
      .fn<() => FakeSpawnedProcess>()
      .mockReturnValueOnce(firstChild)
      .mockReturnValueOnce(secondChild);
    const connectIpc = vi
      .fn<() => FakeIpcClient>()
      .mockReturnValueOnce(firstIpcClient)
      .mockReturnValueOnce(secondIpcClient);
    existingPaths.add(path.join(repoRoot, 'package.json'));
    existingPaths.add(expectedPath);

    const controller = createController({
      connectIpc,
      moduleDir: devModuleDir,
      spawnProcess,
      createIpcEndpoint: () => ipcServerPath,
    });

    const firstLaunch = controller.launch(createLaunchInput({ itemId: 'item-1' }), createProxySettings());
    firstChild.emit('spawn');
    firstIpcClient.emit('connect');

    const secondLaunch = controller.launch(createLaunchInput({ itemId: 'item-2' }), createProxySettings());
    secondChild.emit('spawn');
    secondIpcClient.emit('connect');
    secondIpcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));

    await expect(firstLaunch).resolves.toBeUndefined();
    await expect(secondLaunch).resolves.toBeUndefined();
    expect(firstChild.kill).toHaveBeenCalledTimes(1);
    expect(secondChild.kill).not.toHaveBeenCalled();
  });

  it('waits for file-loaded before resolving launch', async () => {
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

    const launchPromise = controller.launch(createLaunchInput(), createProxySettings());
    child.emit('spawn');
    ipcClient.emit('connect');

    let didResolve = false;
    void launchPromise.then(() => {
      didResolve = true;
    });
    await Promise.resolve();
    expect(didResolve).toBe(false);

    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));

    await expect(launchPromise).resolves.toBeUndefined();
  });

  it('resolves launch when playback properties arrive before file-loaded', async () => {
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

    const launchPromise = controller.launch(createLaunchInput(), createProxySettings());
    child.emit('spawn');
    ipcClient.emit('connect');

    let didResolve = false;
    void launchPromise.then(() => {
      didResolve = true;
    });
    await Promise.resolve();
    expect(didResolve).toBe(false);

    ipcClient.emit(
      'data',
      Buffer.from(`${JSON.stringify({ event: 'property-change', name: 'duration', data: 7200 })}\n`)
    );

    await expect(launchPromise).resolves.toBeUndefined();
  });

  it('resolves launch after ipc connects when mpv does not emit readiness events', async () => {
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
      moduleDir: devModuleDir,
      spawnProcess,
      createIpcEndpoint: () => ipcServerPath,
    });

    const launchPromise = controller.launch(createLaunchInput(), createProxySettings());
    child.emit('spawn');
    ipcClient.emit('connect');

    const timeoutAssertion = expect(launchPromise).resolves.toBeUndefined();

    await vi.advanceTimersByTimeAsync(1500);
    await timeoutAssertion;
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('rejects with the mpv end-file error before the media loads', async () => {
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

    const launchPromise = controller.launch(createLaunchInput(), createProxySettings());
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit(
      'data',
      Buffer.from(
        `${JSON.stringify({ event: 'end-file', reason: 'error', error: 'Access denied' })}\n`
      )
    );

    await expect(launchPromise).rejects.toThrow('Access denied');
  });

  it('includes the raw mpv end-file payload when no error text is present', async () => {
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

    const launchPromise = controller.launch(createLaunchInput(), createProxySettings());
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit(
      'data',
      Buffer.from(
        `${JSON.stringify({
          event: 'end-file',
          reason: 'error',
          file_error: '403 Forbidden',
          playlist_entry_id: 1,
        })}\n`
      )
    );

    await expect(launchPromise).rejects.toThrow(
      '403 Forbidden Event: {"event":"end-file","reason":"error","file_error":"403 Forbidden","playlist_entry_id":1}'
    );
  });

  it('includes recent mpv stderr output when media loading fails', async () => {
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

    const launchPromise = controller.launch(createLaunchInput(), createProxySettings());
    child.emit('spawn');
    child.stderr.emit('data', Buffer.from('[ffmpeg] tls: handshake failed\n'));
    ipcClient.emit('connect');
    ipcClient.emit(
      'data',
      Buffer.from(`${JSON.stringify({ event: 'end-file', reason: 'error' })}\n`)
    );

    await expect(launchPromise).rejects.toThrow(
      '[ffmpeg] tls: handshake failed'
    );
  });

  it('includes recent mpv log file output when media loading fails without stderr', async () => {
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
      readTextFile: () => [
        '[cplayer] Command line options:',
        '[ffmpeg] http: HTTP error 403 Forbidden',
        '[stream] Failed to open https://demo.emby.local/stream',
      ].join('\n'),
    });

    const launchPromise = controller.launch(createLaunchInput(), createProxySettings());
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit(
      'data',
      Buffer.from(`${JSON.stringify({ event: 'end-file', reason: 'error', file_error: 'loading failed' })}\n`)
    );

    await expect(launchPromise).rejects.toThrow(
      'mpv log: [cplayer] Command line options: | [ffmpeg] http: HTTP error 403 Forbidden | [stream] Failed to open https://demo.emby.local/stream'
    );
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

    const launchPromise = controller.launch(createLaunchInput(), createProxySettings());
    child.emit('spawn');
    const timeoutAssertion = expect(launchPromise).rejects.toThrow(/timed out/i);

    await vi.advanceTimersByTimeAsync(200);
    await timeoutAssertion;
  });
});
