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
import type { DanmakuComment } from './danmaku';
import type { DanmakuSettings, ProxySettings } from '@shared/models/settings';

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
  const danmakuMatchedNotice = '\u5df2\u5339\u914d\u5230\u5f39\u5e55\uff1a1 \u6761\n00:12 hello';
  const danmakuMatchedNoticeLog =
    '\\u5df2\\u5339\\u914d\\u5230\\u5f39\\u5e55\\uff1a1 \\u6761\\n00:12 hello';
  const danmakuNoMatchNotice = '\u672a\u5339\u914d\u5230\u5f39\u5e55';
  const danmakuNoMatchNoticeLog = '\\u672a\\u5339\\u914d\\u5230\\u5f39\\u5e55';
  const danmakuSourceErrorNotice =
    '\u5f39\u5e55\u6e90\u8bf7\u6c42\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u5f39\u5e55 API \u5730\u5740\u6216\u51ed\u8bc1';
  const danmakuSourceErrorNoticeLog =
    '\\u5f39\\u5e55\\u6e90\\u8bf7\\u6c42\\u5931\\u8d25\\uff0c\\u8bf7\\u68c0\\u67e5\\u5f39\\u5e55 API \\u5730\\u5740\\u6216\\u51ed\\u8bc1';
  const luaUtf8Bytes = (value: string) =>
    `b(${Array.from(Buffer.from(value, 'utf8')).join(', ')})`;
  const toLuaLongStringForTest = (value: string) => `[=[${value}]=]`;

  let existingPaths: Set<string>;

  beforeEach(() => {
    existingPaths = new Set<string>();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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

  function createDanmakuSettings(overrides: Partial<DanmakuSettings> = {}): DanmakuSettings {
    return {
      enabled: true,
      scrollMaxLines: 5,
      topMaxLines: 3,
      bottomMaxLines: 3,
      scale: 1,
      opacity: 0.5,
      speed: 1,
      bold: false,
      blocklist: [],
      matchMode: 'fileName',
      conversionMode: 'off',
      ...overrides,
    };
  }

  function createDeferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((nextResolve, nextReject) => {
      resolve = nextResolve;
      reject = nextReject;
    });

    return { promise, reject, resolve };
  }

  async function flushAsyncQueue() {
    for (let index = 0; index < 10; index += 1) {
      await Promise.resolve();
    }
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
        '--keepaspect-window=no',
        '--osc=no',
        `--input-ipc-server=${ipcServerPath}`,
        `--input-conf=${inputConfigPath}`,
        `--script=${uiScriptPath}`,
        '--title=Episode 1',
        '--start=0',
        '--osd-font=Microsoft YaHei UI',
        '--osd-duration=1500',
        '--hwdec=auto-safe',
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

  it('forwards player settings patches from mpv client messages', async () => {
    const expectedPath = path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
    const child = new FakeSpawnedProcess();
    const ipcClient = new FakeIpcClient();
    const onPlayerSettingsPatch = vi.fn();
    existingPaths.add(path.join(repoRoot, 'package.json'));
    existingPaths.add(expectedPath);

    const controller = createController({
      connectIpc: vi.fn(() => ipcClient),
      createIpcEndpoint: () => ipcServerPath,
      moduleDir: devModuleDir,
      onPlayerSettingsPatch,
      spawnProcess: vi.fn(() => child),
    });

    const launchPromise = controller.launch(createLaunchInput(), createProxySettings());
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));
    await expect(launchPromise).resolves.toBeUndefined();

    ipcClient.emit(
      'data',
      Buffer.from(
        `${JSON.stringify({
          event: 'client-message',
          args: ['taluxa-settings-patch', '{"playback":{"scaleMode":"stretch"}}'],
        })}\n`
      )
    );

    expect(onPlayerSettingsPatch).toHaveBeenCalledWith({
      playback: { scaleMode: 'stretch' },
    });
  });

  it('launches mpv with persisted playback and subtitle settings', async () => {
    const expectedPath = path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
    const child = new FakeSpawnedProcess();
    const ipcClient = new FakeIpcClient();
    const writeTextFile = vi.fn();
    existingPaths.add(path.join(repoRoot, 'package.json'));
    existingPaths.add(expectedPath);

    const controller = createController({
      connectIpc: vi.fn(() => ipcClient),
      createIpcEndpoint: () => ipcServerPath,
      fetchDanmaku: vi.fn().mockResolvedValue([]),
      moduleDir: devModuleDir,
      spawnProcess: vi.fn(() => child),
      writeTextFile,
    });

    const launchPromise = controller.launch(createLaunchInput(), createProxySettings(), {
      playback: { scaleMode: 'crop' },
      subtitles: {
        enabled: true,
        fontFamily: 'Tahoma',
        delaySeconds: 0.5,
        fontSize: 55,
        position: 100,
        outline: 3,
        shadowOffset: 0,
        scale: 1,
        secondaryEnabled: true,
      },
      danmakuServers: [],
      danmaku: createDanmakuSettings(),
    });

    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));
    await expect(launchPromise).resolves.toBeUndefined();

    expect(writeTextFile).toHaveBeenCalledWith(
      uiScriptPath,
      expect.stringContaining("scale_mode = 'crop'")
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      uiScriptPath,
      expect.stringContaining("font_family = 'Tahoma'")
    );
  });

  it('renders refined top window controls with scaled geometric icons', async () => {
    const expectedPath = path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
    const child = new FakeSpawnedProcess();
    const ipcClient = new FakeIpcClient();
    const writeTextFile = vi.fn();
    existingPaths.add(path.join(repoRoot, 'package.json'));
    existingPaths.add(expectedPath);

    const controller = createController({
      connectIpc: vi.fn(() => ipcClient),
      createIpcEndpoint: () => ipcServerPath,
      moduleDir: devModuleDir,
      spawnProcess: vi.fn(() => child),
      writeTextFile,
    });

    const launchPromise = controller.launch(createLaunchInput(), createProxySettings());
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));
    await expect(launchPromise).resolves.toBeUndefined();

    const uiScript = writeTextFile.mock.calls.find(([targetPath]) => targetPath === uiScriptPath)?.[1];

    expect(uiScript).toEqual(expect.stringContaining('local WINDOW_ICON_SCALE = 0.8'));
    expect(uiScript).toEqual(expect.stringContaining('local window_button_gap = 18'));
    expect(uiScript).toEqual(
      expect.stringContaining(
        "add_window_button(out, 'pin', window_x, 8, window_button_width, window_button_height, 'pin')"
      )
    );
    expect(uiScript).toEqual(
      expect.stringContaining(
        "add_window_button(out, 'maximize', window_x, 8, window_button_width, window_button_height, 'square')"
      )
    );
    expect(uiScript).toEqual(
      expect.stringContaining(
        "draw_window_icon(out, icon, x + math.floor(width / 2), y + math.floor(height / 2))"
      )
    );
    expect(uiScript).not.toEqual(expect.stringContaining("'[]', 34"));
  });

  it('renders compact bottom controls with aligned icons and a fullscreen button', async () => {
    const expectedPath = path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
    const child = new FakeSpawnedProcess();
    const ipcClient = new FakeIpcClient();
    const writeTextFile = vi.fn();
    existingPaths.add(path.join(repoRoot, 'package.json'));
    existingPaths.add(expectedPath);

    const controller = createController({
      connectIpc: vi.fn(() => ipcClient),
      createIpcEndpoint: () => ipcServerPath,
      moduleDir: devModuleDir,
      spawnProcess: vi.fn(() => child),
      writeTextFile,
    });

    const launchPromise = controller.launch(createLaunchInput(), createProxySettings());
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));
    await expect(launchPromise).resolves.toBeUndefined();

    const uiScript = writeTextFile.mock.calls.find(([targetPath]) => targetPath === uiScriptPath)?.[1];

    expect(uiScript).toEqual(expect.stringContaining('local BOTTOM_BUTTON_SCALE = 0.8'));
    expect(uiScript).toEqual(expect.stringContaining('local BOTTOM_GAP_SCALE = 0.5'));
    expect(uiScript).toEqual(expect.stringContaining('local layout = get_bottom_layout(width)'));
    expect(uiScript).toEqual(
      expect.stringContaining(
        "add_button(out, 'play', layout.play_x, button_y, bottom_icon_button, bottom_button_height"
      )
    );
    expect(uiScript).toEqual(
      expect.stringContaining(
        "add_icon_button(out, 'fullscreen', layout.fullscreen_x, button_y, bottom_icon_button, bottom_button_height, 'fullscreen')"
      )
    );
    expect(uiScript).toEqual(
      expect.stringContaining(
        'local settings_center = layout.settings_x + math.floor(layout.icon_width / 2)'
      )
    );
    expect(uiScript).not.toEqual(expect.stringContaining("'[ ]', 30"));
  });

  it('renders an episode picker button for series playback and forwards episode selections', async () => {
    const expectedPath = path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
    const child = new FakeSpawnedProcess();
    const ipcClient = new FakeIpcClient();
    const writeTextFile = vi.fn();
    const onEpisodeSelect = vi.fn();
    existingPaths.add(path.join(repoRoot, 'package.json'));
    existingPaths.add(expectedPath);

    const controller = createController({
      connectIpc: vi.fn(() => ipcClient),
      createIpcEndpoint: () => ipcServerPath,
      moduleDir: devModuleDir,
      onEpisodeSelect,
      spawnProcess: vi.fn(() => child),
      writeTextFile,
    });

    const launchPromise = controller.launch(
      createLaunchInput({
        itemId: 'episode-2',
        episodeSelector: {
          currentItemId: 'episode-2',
          episodes: [
            {
              itemId: 'episode-1',
              title: 'S1E1 - First Case',
              durationSeconds: 3000,
              thumbnailUrl: 'https://demo.emby.local/Items/episode-1/Images/Primary',
            },
            {
              itemId: 'episode-2',
              title: 'S1E2 - Second Case',
              durationSeconds: 2580,
              thumbnailUrl: 'https://demo.emby.local/Items/episode-2/Images/Primary',
            },
          ],
        },
      }),
      createProxySettings()
    );
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));
    await expect(launchPromise).resolves.toBeUndefined();

    const uiScript = String(writeTextFile.mock.calls.find(([targetPath]) => targetPath === uiScriptPath)?.[1]);
    expect(uiScript).toContain('local episode_selector_enabled = #episode_items > 0');
    expect(uiScript).toContain('local episode_scroll_offset = 0');
    expect(uiScript).toContain('local episode_icon_size = size * 1.42');
    expect(uiScript).toContain("add_icon_button(out, 'episodes', layout.episodes_x, button_y, bottom_icon_button, bottom_button_height, 'episodes')");
    expect(uiScript).toContain('local function draw_episode_panel(out)');
    expect(uiScript).toContain("add_button(out, 'episode-option', panel_x, item_y, panel_width, item_height, '', 1, episode.item_id)");
    expect(uiScript).toContain('local thumbnail_overlay_id = 40 + visible_slot');
    expect(uiScript).toContain('local function sync_episode_thumbnail_overlays(active_overlay_ids)');
    expect(uiScript).toContain('if episode_thumbnail_overlay_ids[overlay_id] == overlay_key then');
    expect(uiScript).not.toContain('5200 + index');
    expect(uiScript).not.toContain('clear_episode_thumbnail_overlays()\n  clamp_episode_scroll()');
    expect(uiScript).toContain('local function scroll_episode_panel(delta)');
    expect(uiScript).toContain('if episode_panel_open then');
    expect(uiScript).toContain('scroll_episode_panel(delta)');
    expect(uiScript).toContain("request_episode_switch(tostring(button.value))");
    expect(uiScript).toContain("mp.register_script_message('taluxa-active-episode'");
    expect(uiScript).toContain('is_current = true');
    expect(uiScript).toContain(toLuaLongStringForTest('S1E2 - Second Case'));
    expect(uiScript).toContain(toLuaLongStringForTest('43min'));

    ipcClient.emit(
      'data',
      Buffer.from(
        `${JSON.stringify({
          event: 'client-message',
          args: ['taluxa-select-episode', 'episode-1'],
        })}\n`
      )
    );

    expect(onEpisodeSelect).toHaveBeenCalledWith('episode-1');
  });

  it('switches a selected episode inside the active mpv process', async () => {
    const expectedPath = path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
    const child = new FakeSpawnedProcess();
    const ipcClient = new FakeIpcClient();
    const spawnProcess = vi.fn(() => child);
    existingPaths.add(path.join(repoRoot, 'package.json'));
    existingPaths.add(expectedPath);

    const controller = createController({
      connectIpc: vi.fn(() => ipcClient),
      createIpcEndpoint: () => ipcServerPath,
      moduleDir: devModuleDir,
      spawnProcess,
    });

    const launchPromise = controller.launch(
      createLaunchInput({ itemId: 'episode-1' }),
      createProxySettings()
    );
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));
    await expect(launchPromise).resolves.toBeUndefined();
    ipcClient.write.mockClear();

    await controller.switchEpisode(
      createLaunchInput({
        httpHeaders: {
          Authorization: 'MediaBrowser Token="token-123"',
        },
        itemId: 'episode-2',
        startSeconds: 18,
        streamUrl: 'https://example.com/episode-2.mp4',
        title: 'Series 1 - S1E2 - Second Case',
      }),
      createProxySettings()
    );

    expect(spawnProcess).toHaveBeenCalledTimes(1);
    expect(ipcClient.write).toHaveBeenCalledWith(
      `${JSON.stringify({
        command: [
          'set_property',
          'http-header-fields',
          ['Authorization: MediaBrowser Token="token-123"'],
        ],
      })}\n`
    );
    expect(ipcClient.write).toHaveBeenCalledWith(
      `${JSON.stringify({
        command: [
          'loadfile',
          'https://example.com/episode-2.mp4',
          'replace',
          -1,
          {
            start: '18',
            'force-media-title': 'Series 1 - S1E2 - Second Case',
          },
        ],
      })}\n`
    );
    expect(ipcClient.write).toHaveBeenCalledWith(
      `${JSON.stringify({
        command: [
          'script-message',
          'taluxa-active-episode',
          'episode-2',
          'Series 1 - S1E2 - Second Case',
          'Series 1',
          'S1E2 - Second Case',
        ],
      })}\n`
    );
  });

  it('does not render the episode picker button for movie playback', async () => {
    const expectedPath = path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
    const child = new FakeSpawnedProcess();
    const ipcClient = new FakeIpcClient();
    const writeTextFile = vi.fn();
    existingPaths.add(path.join(repoRoot, 'package.json'));
    existingPaths.add(expectedPath);

    const controller = createController({
      connectIpc: vi.fn(() => ipcClient),
      createIpcEndpoint: () => ipcServerPath,
      moduleDir: devModuleDir,
      spawnProcess: vi.fn(() => child),
      writeTextFile,
    });

    const launchPromise = controller.launch(createLaunchInput(), createProxySettings());
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));
    await expect(launchPromise).resolves.toBeUndefined();

    const uiScript = String(writeTextFile.mock.calls.find(([targetPath]) => targetPath === uiScriptPath)?.[1]);
    expect(uiScript).toContain('local episode_selector_enabled = #episode_items > 0');
    expect(uiScript).toContain('local episode_items = {}');
  });

  it('loads a generated ASS danmaku subtitle file when comments are available', async () => {
    const expectedPath = path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
    const child = new FakeSpawnedProcess();
    const ipcClient = new FakeIpcClient();
    const spawnProcess = vi.fn(() => child);
    const connectIpc = vi.fn(() => ipcClient);
    const writeTextFile = vi.fn();
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
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
      {
        danmakuServers: [
          {
            id: 'official',
            name: 'Official',
            url: 'https://api.dandanplay.net',
            enabled: true,
          },
        ],
      }
    );
    await Promise.resolve();
    await Promise.resolve();
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));

    await expect(launchPromise).resolves.toBeUndefined();
    await flushAsyncQueue();
    expect(writeTextFile).toHaveBeenCalledWith(
      danmakuAssPath,
      expect.stringContaining('Dialogue: 0,0:00:12.00')
    );
    expect(spawnProcess).toHaveBeenCalledWith(
      expectedPath,
      expect.not.arrayContaining([`--sub-file=${danmakuAssPath}`]),
      expect.any(Object)
    );
    expect(ipcClient.write).toHaveBeenCalledWith(
      `${JSON.stringify({ command: ['sub-add', danmakuAssPath, 'select'] })}\n`
    );
    expect(ipcClient.write).toHaveBeenCalledWith(
      `${JSON.stringify({ command: ['show-text', danmakuMatchedNotice, '5000'] })}\n`
    );
    expect(consoleInfo).toHaveBeenCalledWith(
      `[danmaku][session 1] notice=${danmakuMatchedNoticeLog}`
    );
  });

  it('starts playback before danmaku lookup finishes then adds matched danmaku with a 5 second notice', async () => {
    const expectedPath = path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
    const child = new FakeSpawnedProcess();
    const ipcClient = new FakeIpcClient();
    const spawnProcess = vi.fn(() => child);
    const connectIpc = vi.fn(() => ipcClient);
    const writeTextFile = vi.fn();
    const danmakuLookup = createDeferred<DanmakuComment[]>();
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    existingPaths.add(path.join(repoRoot, 'package.json'));
    existingPaths.add(expectedPath);

    const controller = createController({
      connectIpc,
      moduleDir: devModuleDir,
      spawnProcess,
      createIpcEndpoint: () => ipcServerPath,
      createDanmakuFilePath: () => danmakuAssPath,
      fetchDanmaku: vi.fn().mockReturnValue(danmakuLookup.promise),
      writeTextFile,
    });

    const launchPromise = controller.launch(
      createLaunchInput(),
      createProxySettings(),
      {
        danmakuServers: [
          {
            id: 'official',
            name: 'Official',
            url: 'https://api.dandanplay.net',
            enabled: true,
          },
        ],
        danmaku: createDanmakuSettings(),
      }
    );
    await flushAsyncQueue();
    expect(spawnProcess).toHaveBeenCalledTimes(1);

    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));

    await expect(launchPromise).resolves.toBeUndefined();
    expect(writeTextFile).not.toHaveBeenCalledWith(
      danmakuAssPath,
      expect.stringContaining('Dialogue: 0,0:00:12.00')
    );

    danmakuLookup.resolve([
      { color: 16777215, mode: 'scroll', text: 'hello', timeSeconds: 12 },
    ]);
    await flushAsyncQueue();

    expect(writeTextFile).toHaveBeenCalledWith(
      danmakuAssPath,
      expect.stringContaining('Dialogue: 0,0:00:12.00')
    );
    expect(ipcClient.write).toHaveBeenCalledWith(
      `${JSON.stringify({ command: ['sub-add', danmakuAssPath, 'select'] })}\n`
    );
    expect(ipcClient.write).toHaveBeenCalledWith(
      `${JSON.stringify({ command: ['show-text', danmakuMatchedNotice, '5000'] })}\n`
    );
    expect(consoleInfo).toHaveBeenCalledWith(
      `[danmaku][session 1] notice=${danmakuMatchedNoticeLog}`
    );
  });

  it('shows a 5 second notice without blocking playback when no danmaku comments match', async () => {
    const expectedPath = path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
    const child = new FakeSpawnedProcess();
    const ipcClient = new FakeIpcClient();
    const spawnProcess = vi.fn(() => child);
    const connectIpc = vi.fn(() => ipcClient);
    const writeTextFile = vi.fn();
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    existingPaths.add(path.join(repoRoot, 'package.json'));
    existingPaths.add(expectedPath);

    const controller = createController({
      connectIpc,
      moduleDir: devModuleDir,
      spawnProcess,
      createIpcEndpoint: () => ipcServerPath,
      createDanmakuFilePath: () => danmakuAssPath,
      fetchDanmaku: vi.fn().mockResolvedValue([]),
      writeTextFile,
    });

    const launchPromise = controller.launch(
      createLaunchInput(),
      createProxySettings(),
      {
        danmakuServers: [
          {
            id: 'official',
            name: 'Official',
            url: 'https://api.dandanplay.net',
            enabled: true,
          },
        ],
        danmaku: createDanmakuSettings(),
      }
    );
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));

    await expect(launchPromise).resolves.toBeUndefined();
    await flushAsyncQueue();

    expect(writeTextFile).not.toHaveBeenCalledWith(danmakuAssPath, expect.any(String));
    expect(ipcClient.write).toHaveBeenCalledWith(
      `${JSON.stringify({ command: ['show-text', danmakuNoMatchNotice, '5000'] })}\n`
    );
    expect(consoleInfo).toHaveBeenCalledWith(
      `[danmaku][session 1] notice=${danmakuNoMatchNoticeLog}`
    );
  });

  it('shows a source error notice when every danmaku source rejects the request', async () => {
    const expectedPath = path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
    const child = new FakeSpawnedProcess();
    const ipcClient = new FakeIpcClient();
    const spawnProcess = vi.fn(() => child);
    const connectIpc = vi.fn(() => ipcClient);
    const writeTextFile = vi.fn();
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    existingPaths.add(path.join(repoRoot, 'package.json'));
    existingPaths.add(expectedPath);

    const controller = createController({
      connectIpc,
      moduleDir: devModuleDir,
      spawnProcess,
      createIpcEndpoint: () => ipcServerPath,
      createDanmakuFilePath: () => danmakuAssPath,
      fetchDanmaku: vi.fn().mockRejectedValue(new Error('Danmaku sources failed (403, 402)')),
      writeTextFile,
    });

    const launchPromise = controller.launch(
      createLaunchInput(),
      createProxySettings(),
      {
        danmakuServers: [
          {
            id: 'official',
            name: 'Official',
            url: 'https://api.dandanplay.net',
            enabled: true,
          },
        ],
        danmaku: createDanmakuSettings(),
      }
    );
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));

    await expect(launchPromise).resolves.toBeUndefined();
    await flushAsyncQueue();

    expect(writeTextFile).not.toHaveBeenCalledWith(danmakuAssPath, expect.any(String));
    expect(ipcClient.write).toHaveBeenCalledWith(
      `${JSON.stringify({ command: ['show-text', danmakuSourceErrorNotice, '5000'] })}\n`
    );
    expect(consoleInfo).toHaveBeenCalledWith(
      `[danmaku][session 1] notice=${danmakuSourceErrorNoticeLog}`
    );
  });

  it('ignores empty mpv stderr chunks without showing a danmaku miss notice', async () => {
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
    child.stderr.emit('data', Buffer.from('\n'));
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));

    await expect(launchPromise).resolves.toBeUndefined();
    expect(ipcClient.write).not.toHaveBeenCalledWith(
      `${JSON.stringify({ command: ['show-text', danmakuNoMatchNotice, '5000'] })}\n`
    );
  });

  it('skips danmaku fetching when danmaku is disabled', async () => {
    const expectedPath = path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
    const child = new FakeSpawnedProcess();
    const ipcClient = new FakeIpcClient();
    const spawnProcess = vi.fn(() => child);
    const connectIpc = vi.fn(() => ipcClient);
    const fetchDanmaku = vi.fn().mockResolvedValue([
      { color: 16777215, mode: 'scroll', text: 'hidden', timeSeconds: 12 },
    ]);
    existingPaths.add(path.join(repoRoot, 'package.json'));
    existingPaths.add(expectedPath);

    const controller = createController({
      connectIpc,
      moduleDir: devModuleDir,
      spawnProcess,
      createIpcEndpoint: () => ipcServerPath,
      createDanmakuFilePath: () => danmakuAssPath,
      fetchDanmaku,
    });

    const launchPromise = controller.launch(
      createLaunchInput(),
      createProxySettings(),
      {
        danmakuServers: [
          {
            id: 'official',
            name: 'Official',
            url: 'https://api.dandanplay.net',
            enabled: true,
          },
        ],
        danmaku: createDanmakuSettings({ enabled: false }),
      }
    );
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));

    await expect(launchPromise).resolves.toBeUndefined();
    expect(fetchDanmaku).not.toHaveBeenCalled();
    expect(spawnProcess).toHaveBeenCalledWith(
      expectedPath,
      expect.not.arrayContaining([`--sub-file=${danmakuAssPath}`]),
      expect.any(Object)
    );
  });

  it('passes danmaku display settings into the generated ASS subtitle file', async () => {
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
        { color: 16777215, mode: 'scroll', text: 'visible', timeSeconds: 12 },
        { color: 16777215, mode: 'scroll', text: 'blocked spoiler', timeSeconds: 13 },
      ]),
      writeTextFile,
    });

    const launchPromise = controller.launch(
      createLaunchInput(),
      createProxySettings(),
      {
        danmakuServers: [
          {
            id: 'official',
            name: 'Official',
            url: 'https://api.dandanplay.net',
            enabled: true,
          },
        ],
        danmaku: createDanmakuSettings({
          blocklist: ['spoiler'],
          bold: true,
          opacity: 0.25,
          scale: 1.5,
          speed: 2,
        }),
      }
    );
    await Promise.resolve();
    await Promise.resolve();
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));

    await expect(launchPromise).resolves.toBeUndefined();
    expect(writeTextFile).toHaveBeenCalledWith(
      danmakuAssPath,
      expect.stringContaining('Style: Scroll,Microsoft YaHei UI,51,&HBF00FFFFFF')
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      danmakuAssPath,
      expect.stringContaining('Dialogue: 0,0:00:12.00,0:00:18.00,Scroll')
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      danmakuAssPath,
      expect.not.stringContaining('blocked spoiler')
    );
  });

  it('regenerates loaded danmaku subtitles when mpv patches danmaku settings', async () => {
    const expectedPath = path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
    const child = new FakeSpawnedProcess();
    const ipcClient = new FakeIpcClient();
    const writeTextFile = vi.fn();
    existingPaths.add(path.join(repoRoot, 'package.json'));
    existingPaths.add(expectedPath);

    const controller = createController({
      connectIpc: vi.fn(() => ipcClient),
      createDanmakuFilePath: () => danmakuAssPath,
      createIpcEndpoint: () => ipcServerPath,
      fetchDanmaku: vi.fn().mockResolvedValue([
        { color: 16777215, mode: 'scroll', text: 'visible', timeSeconds: 12 },
      ]),
      moduleDir: devModuleDir,
      spawnProcess: vi.fn(() => child),
      writeTextFile,
    });

    const launchPromise = controller.launch(createLaunchInput(), createProxySettings(), {
      danmakuServers: [
        { id: 'official', name: 'Official', url: 'https://api.dandanplay.net', enabled: true },
      ],
      danmaku: createDanmakuSettings({ opacity: 0.5 }),
    });
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));
    await expect(launchPromise).resolves.toBeUndefined();
    await flushAsyncQueue();

    ipcClient.emit(
      'data',
      Buffer.from(
        `${JSON.stringify({
          event: 'client-message',
          args: ['taluxa-settings-patch', '{"danmaku":{"opacity":0.25,"scale":1.5}}'],
        })}\n`
      )
    );

    expect(writeTextFile).toHaveBeenCalledWith(
      danmakuAssPath,
      expect.stringContaining('Style: Scroll,Microsoft YaHei UI,51,&HBF00FFFFFF')
    );
    expect(ipcClient.write).toHaveBeenCalledWith(
      `${JSON.stringify({ command: ['sub-add', danmakuAssPath, 'select'] })}\n`
    );
  });

  it('renders danmaku settings menu controls that emit settings patches', async () => {
    const writeTextFile = vi.fn();
    const expectedPath = path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
    const child = new FakeSpawnedProcess();
    const ipcClient = new FakeIpcClient();
    existingPaths.add(path.join(repoRoot, 'package.json'));
    existingPaths.add(expectedPath);

    const controller = createController({
      connectIpc: vi.fn(() => ipcClient),
      createIpcEndpoint: () => ipcServerPath,
      moduleDir: devModuleDir,
      spawnProcess: vi.fn(() => child),
      writeTextFile,
    });

    const launchPromise = controller.launch(createLaunchInput(), createProxySettings(), {
      danmaku: createDanmakuSettings(),
    });
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));
    await expect(launchPromise).resolves.toBeUndefined();

    const script = String(writeTextFile.mock.calls.find(([target]) => target === uiScriptPath)?.[1]);
    expect(script).toContain(`danmaku_settings = ${luaUtf8Bytes('\u5f39\u5e55\u8bbe\u7f6e')}`);
    expect(script).toContain(`scroll_max_lines = ${luaUtf8Bytes('\u6eda\u52a8\u5f39\u5e55\u6700\u5927\u884c\u6570')}`);
    expect(script).toContain(`top_max_lines = ${luaUtf8Bytes('\u9876\u90e8\u5f39\u5e55\u6700\u5927\u884c\u6570')}`);
    expect(script).toContain(`bottom_max_lines = ${luaUtf8Bytes('\u5e95\u90e8\u5f39\u5e55\u6700\u5927\u884c\u6570')}`);
    expect(script).toContain(`danmaku_opacity = ${luaUtf8Bytes('\u5f39\u5e55\u900f\u660e\u5ea6')}`);
    expect(script).toContain('localize_options(options, menu_open)');
    expect(script).toContain('danmaku-value-minus');
    expect(script).toContain('{"danmaku"');
  });

  it('toggles the built-in mpv statistics overlay from settings', async () => {
    const writeTextFile = vi.fn();
    const expectedPath = path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
    const child = new FakeSpawnedProcess();
    const ipcClient = new FakeIpcClient();
    existingPaths.add(path.join(repoRoot, 'package.json'));
    existingPaths.add(expectedPath);

    const controller = createController({
      connectIpc: vi.fn(() => ipcClient),
      createIpcEndpoint: () => ipcServerPath,
      moduleDir: devModuleDir,
      spawnProcess: vi.fn(() => child),
      writeTextFile,
    });

    const launchPromise = controller.launch(createLaunchInput(), createProxySettings());
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));
    await expect(launchPromise).resolves.toBeUndefined();

    const script = String(writeTextFile.mock.calls.find(([target]) => target === uiScriptPath)?.[1]);
    expect(script).toContain("mp.commandv('script-binding', 'stats/display-stats-toggle')");
  });

  it('draws blue progress and light-blue cached seek ranges', async () => {
    const writeTextFile = vi.fn();
    const expectedPath = path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
    const child = new FakeSpawnedProcess();
    const ipcClient = new FakeIpcClient();
    existingPaths.add(path.join(repoRoot, 'package.json'));
    existingPaths.add(expectedPath);

    const controller = createController({
      connectIpc: vi.fn(() => ipcClient),
      createIpcEndpoint: () => ipcServerPath,
      moduleDir: devModuleDir,
      spawnProcess: vi.fn(() => child),
      writeTextFile,
    });

    const launchPromise = controller.launch(createLaunchInput(), createProxySettings());
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));
    await expect(launchPromise).resolves.toBeUndefined();

    const script = String(writeTextFile.mock.calls.find(([target]) => target === uiScriptPath)?.[1]);
    expect(script).toContain("local BLUE = 'FF7716'");
    expect(script).toContain("local CACHE_BLUE = 'FFCF8F'");
    expect(script).toContain("mp.observe_property('demuxer-cache-state', 'native'");
    expect(script).toContain('seekable-ranges');
    expect(script).toContain(
      'append_box(out, progress_x - 7, bar_y - 7, progress_x + 7, bar_y + 7, BLUE, 0)'
    );
    expect(script).toContain(
      'append_box(out, volume_value_x - 7, controls_y - 7, volume_value_x + 7, controls_y + 7, BLUE, 0)'
    );
    expect(script).not.toContain('append_box(out, volume_value_x - 8, controls_y - 9');
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
      expect.not.stringContaining("append_box(out, 0, height - 210, width, bottom, '000000', 130)")
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
      expect.stringContaining('local window_button_width = 44')
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      uiScriptPath,
      expect.stringContaining("add_window_button(out, 'close', window_x, 8, window_button_width")
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      uiScriptPath,
      expect.stringContaining('local CONTROL_HIDE_SECONDS = 3')
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      uiScriptPath,
      expect.stringContaining('if not should_show_controls() then')
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      uiScriptPath,
      expect.stringContaining("overlay.data = ''")
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      uiScriptPath,
      expect.stringContaining("mp.get_property_native('mouse-pos')")
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      uiScriptPath,
      expect.stringContaining("UI_WIDTH = mp.get_property_number('osd-width', UI_WIDTH)")
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
    const uiScript = writeTextFile.mock.calls.find(([targetPath]) => targetPath === uiScriptPath)?.[1];
    expect(uiScript).toContain("elseif id == 'maximize' then");
    expect(uiScript).toContain("mp.get_property_bool('window-maximized')");
    expect(uiScript).toContain(
      "mp.commandv('script-message', 'taluxa-toggle-window-maximize', is_maximized)"
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      uiScriptPath,
      expect.stringContaining(
        `toggle_notice = ${luaUtf8Bytes('\u5f39\u5e55/\u5b57\u5e55\u5df2\u5207\u6362')}`
      )
    );
    expect(spawnProcess).toHaveBeenCalledWith(
      expectedPath,
      expect.arrayContaining([
        '--border=no',
        '--keepaspect-window=no',
        '--osc=no',
        `--input-conf=${inputConfigPath}`,
        `--script=${uiScriptPath}`,
        '--cache=yes',
        '--cache-secs=120',
      ]),
      expect.any(Object)
    );
  });

  it('maximizes the mpv window to the current display work area', async () => {
    const expectedPath = path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
    const child = new FakeSpawnedProcess();
    const ipcClient = new FakeIpcClient();
    const spawnProcess = vi.fn(() => child);
    existingPaths.add(path.join(repoRoot, 'package.json'));
    existingPaths.add(expectedPath);

    const controller = createController({
      connectIpc: vi.fn(() => ipcClient),
      createIpcEndpoint: () => ipcServerPath,
      getWindowMaximizeBounds: () => ({ x: 38, y: 0, width: 2010, height: 1121 }),
      moduleDir: devModuleDir,
      spawnProcess,
    });

    const launchPromise = controller.launch(createLaunchInput(), createProxySettings());
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));
    await expect(launchPromise).resolves.toBeUndefined();

    ipcClient.write.mockClear();
    ipcClient.emit(
      'data',
      Buffer.from(
        `${JSON.stringify({
          event: 'client-message',
          args: ['taluxa-toggle-window-maximize', 'no'],
        })}\n`
      )
    );

    expect(ipcClient.write).toHaveBeenCalledWith(
      `${JSON.stringify({ command: ['set_property', 'fullscreen', false] })}\n`
    );
    expect(ipcClient.write).toHaveBeenCalledWith(
      `${JSON.stringify({ command: ['set_property', 'window-maximized', true] })}\n`
    );
    expect(ipcClient.write).toHaveBeenCalledWith(
      `${JSON.stringify({ command: ['set_property', 'force-window-position', true] })}\n`
    );
    expect(ipcClient.write).toHaveBeenCalledWith(
      `${JSON.stringify({ command: ['set_property', 'geometry', '2010x1121+38+0'] })}\n`
    );
  });

  it('renders scale mode settings menu entries and applies mpv scale commands', async () => {
    const writeTextFile = vi.fn();
    const expectedPath = path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
    const child = new FakeSpawnedProcess();
    const ipcClient = new FakeIpcClient();
    existingPaths.add(path.join(repoRoot, 'package.json'));
    existingPaths.add(expectedPath);

    const controller = createController({
      connectIpc: vi.fn(() => ipcClient),
      createIpcEndpoint: () => ipcServerPath,
      moduleDir: devModuleDir,
      spawnProcess: vi.fn(() => child),
      writeTextFile,
    });

    const launchPromise = controller.launch(createLaunchInput(), createProxySettings(), {
      playback: { scaleMode: 'fit' },
    });
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));
    await expect(launchPromise).resolves.toBeUndefined();

    const script = String(writeTextFile.mock.calls.find(([target]) => target === uiScriptPath)?.[1]);
    expect(script).toContain("menu_open = 'settings'");
    expect(script).toContain("menu_open = 'scale'");
    expect(script).toContain(
      'settings_center = layout.settings_x + math.floor(layout.icon_width / 2)'
    );
    expect(script).toContain("anchor_center - math.floor(menu_width / 2)");
    expect(script).toContain('local item_height = round_coord(46 * 0.8)');
    expect(script).toContain('local menu_text_size = round_coord(24 * 0.9)');
    expect(script).toContain('local menu_suffix_size = round_coord(18 * 0.9)');
    expect(script).toContain('local menu_vertical_offset = 24');
    expect(script).toContain('local function estimate_menu_text_width(text, size)');
    expect(script).toContain('local max_text_width = 0');
    expect(script).toContain('local suffix_width = option.suffix and estimate_menu_text_width(option.suffix, menu_suffix_size) or 0');
    expect(script).toContain('local content_width = label_width + suffix_width + (option.suffix and menu_suffix_gap or 0)');
    expect(script).toContain('local menu_width = math.max(menu_min_width, round_coord(max_text_width * 1.2))');
    expect(script).toContain("append_box(out, x, y, x + menu_width, y + menu_height, '101010', 128)");
    expect(script).toContain('local y = height - 128 - menu_height + menu_vertical_offset');
    expect(script).toContain('add_button(out, option.id, x, item_y, menu_width, item_height, label, menu_text_size, option.value)');
    expect(script).toContain("append_text(out, x + menu_width - 14, item_y + math.floor(item_height / 2) + 1, 6, menu_suffix_size, option.suffix, 'CFCFCF', 0, false)");
    expect(script).toContain(`scale_mode = ${luaUtf8Bytes('\u7f29\u653e\u6a21\u5f0f')}`);
    expect(script).toContain(`skip_intro = ${luaUtf8Bytes('\u8df3\u8fc7\u7247\u5934/\u7247\u5c3e')}`);
    expect(script).toContain(`subtitle_settings = ${luaUtf8Bytes('\u5b57\u5e55\u8bbe\u7f6e')}`);
    expect(script).toContain(`danmaku_settings = ${luaUtf8Bytes('\u5f39\u5e55\u8bbe\u7f6e')}`);
    expect(script).toContain(`statistics = ${luaUtf8Bytes('\u7edf\u8ba1\u4fe1\u606f')}`);
    expect(script).toContain(`fit = ${luaUtf8Bytes('\u9002\u5e94\u5c4f\u5e55')}`);
    expect(script).toContain(`stretch = ${luaUtf8Bytes('\u62c9\u4f38')}`);
    expect(script).toContain(`crop = ${luaUtf8Bytes('\u88c1\u526a')}`);
    expect(script).not.toContain('Scale Mode');
    expect(script).not.toContain('Skip Intro/Ending');
    expect(script).not.toContain('Subtitle Settings');
    expect(script).not.toContain('Danmaku Settings');
    expect(script).not.toContain('Statistics');
    expect(script).toContain("mp.commandv('set', 'keepaspect', 'no')");
    expect(script).toContain("mp.commandv('set', 'panscan', '1')");
  });

  it('renders subtitle settings and dual subtitle controls', async () => {
    const writeTextFile = vi.fn();
    const expectedPath = path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
    const child = new FakeSpawnedProcess();
    const ipcClient = new FakeIpcClient();
    existingPaths.add(path.join(repoRoot, 'package.json'));
    existingPaths.add(expectedPath);

    const controller = createController({
      connectIpc: vi.fn(() => ipcClient),
      createIpcEndpoint: () => ipcServerPath,
      moduleDir: devModuleDir,
      spawnProcess: vi.fn(() => child),
      writeTextFile,
    });

    const launchPromise = controller.launch(createLaunchInput(), createProxySettings(), {
      subtitles: {
        enabled: true,
        fontFamily: 'Tahoma',
        delaySeconds: 0,
        fontSize: 55,
        position: 100,
        outline: 3,
        shadowOffset: 0,
        scale: 1,
        secondaryEnabled: true,
      },
    });
    child.emit('spawn');
    ipcClient.emit('connect');
    ipcClient.emit('data', Buffer.from(`${JSON.stringify({ event: 'file-loaded' })}\n`));
    await expect(launchPromise).resolves.toBeUndefined();

    const script = String(writeTextFile.mock.calls.find(([target]) => target === uiScriptPath)?.[1]);
    expect(script).toContain("mp.commandv('set', 'sid'");
    expect(script).toContain("mp.commandv('set', 'secondary-sid'");
    expect(script).toContain("mp.commandv('set', 'secondary-sub-visibility'");
    expect(script).toContain("mp.commandv('set', 'sub-font', subtitle_settings.font_family)");
    expect(script).toContain(`subtitle_settings = ${luaUtf8Bytes('\u5b57\u5e55\u8bbe\u7f6e')}`);
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
        '--keepaspect-window=no',
        '--osc=no',
        `--input-ipc-server=${ipcServerPath}`,
        `--input-conf=${inputConfigPath}`,
        `--script=${uiScriptPath}`,
        '--title=Episode 1',
        '--start=12',
        '--osd-font=Microsoft YaHei UI',
        '--osd-duration=1500',
        '--hwdec=auto-safe',
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
        '--keepaspect-window=no',
        '--osc=no',
        `--input-ipc-server=${ipcServerPath}`,
        `--input-conf=${inputConfigPath}`,
        `--script=${uiScriptPath}`,
        '--title=Episode 1',
        '--start=12',
        '--osd-font=Microsoft YaHei UI',
        '--osd-duration=1500',
        '--hwdec=auto-safe',
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
        '--keepaspect-window=no',
        '--osc=no',
        `--input-ipc-server=${ipcServerPath}`,
        `--input-conf=${inputConfigPath}`,
        `--script=${uiScriptPath}`,
        '--title=Episode 1',
        '--start=12',
        '--osd-font=Microsoft YaHei UI',
        '--osd-duration=1500',
        '--hwdec=auto-safe',
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
        '--keepaspect-window=no',
        '--osc=no',
        `--input-ipc-server=${ipcServerPath}`,
        `--input-conf=${inputConfigPath}`,
        `--script=${uiScriptPath}`,
        '--title=Episode 1',
        '--start=12',
        '--osd-font=Microsoft YaHei UI',
        '--osd-duration=1500',
        '--hwdec=auto-safe',
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
        '--keepaspect-window=no',
        '--osc=no',
        `--input-ipc-server=${ipcServerPath}`,
        `--input-conf=${inputConfigPath}`,
        `--script=${uiScriptPath}`,
        '--title=Episode 1',
        '--start=12',
        '--osd-font=Microsoft YaHei UI',
        '--osd-duration=1500',
        '--hwdec=auto-safe',
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
        '--keepaspect-window=no',
        '--osc=no',
        `--input-ipc-server=${ipcServerPath}`,
        `--input-conf=${inputConfigPath}`,
        `--script=${uiScriptPath}`,
        '--title=Episode 1',
        '--start=12',
        '--osd-font=Microsoft YaHei UI',
        '--osd-duration=1500',
        '--hwdec=auto-safe',
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
        '--keepaspect-window=no',
        '--osc=no',
        `--input-ipc-server=${ipcServerPath}`,
        `--input-conf=${inputConfigPath}`,
        `--script=${uiScriptPath}`,
        '--title=Episode 1',
        '--start=12',
        '--osd-font=Microsoft YaHei UI',
        '--osd-duration=1500',
        '--hwdec=auto-safe',
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
