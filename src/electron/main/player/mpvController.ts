import { spawn, type SpawnOptions } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProxySettings } from '@shared/models/settings';
import { isCustomProxyConfigured } from '@shared/network/proxy';

export interface LaunchMpvInput {
  httpHeaders?: Record<string, string>;
  itemId: string;
  streamUrl: string;
  title: string;
  startSeconds?: number;
}

export interface MpvProgressSnapshot {
  itemId: string;
  positionSeconds: number;
  durationSeconds: number;
}

export interface SpawnedMpvProcess {
  once(event: 'error', listener: (error: Error) => void): this;
  once(
    event: 'exit',
    listener: (code: number | null, signal: NodeJS.Signals | null) => void
  ): this;
  once(event: 'spawn', listener: () => void): this;
  stderr?: {
    on(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
  } | null;
  removeListener(event: 'error', listener: (error: Error) => void): this;
  removeListener(
    event: 'exit',
    listener: (code: number | null, signal: NodeJS.Signals | null) => void
  ): this;
  removeListener(event: 'spawn', listener: () => void): this;
  kill?(signal?: NodeJS.Signals | number): boolean;
  unref(): void;
}

export interface MpvIpcClient {
  destroy(): void;
  on(event: 'close', listener: () => void): this;
  on(event: 'connect', listener: () => void): this;
  on(event: 'data', listener: (chunk: Buffer | string) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  setEncoding?(encoding: BufferEncoding): void;
  write(data: string): void;
}

type SpawnProcess = (
  command: string,
  args: string[],
  options: SpawnOptions
) => SpawnedMpvProcess;

type ConnectIpc = (ipcServerPath: string) => MpvIpcClient;

interface ActiveSession {
  buffer: string;
  child: SpawnedMpvProcess;
  client: MpvIpcClient | null;
  connectAttempt: number;
  connectTimeout: NodeJS.Timeout | null;
  durationSeconds: number;
  hasConnected: boolean;
  ipcServerPath: string;
  isReady: boolean;
  itemId: string;
  onFailure: (error: Error) => void;
  onReady: () => void;
  positionSeconds: number | null;
  readyFallbackTimeout: NodeJS.Timeout | null;
  retryTimeout: NodeJS.Timeout | null;
  sessionId: number;
  logFilePath: string;
  stderrLines: string[];
}

const IPC_CONNECTED_READY_FALLBACK_MS = 1500;
const MAX_STDERR_LINES = 8;
const MAX_LOG_LINES = 8;
const DEFAULT_CACHE_SECONDS = 120;

function createMpvInputConfig(): string {
  return [
    '# Taluxa mpv controls',
    'F6 cycle-values speed 0.5 0.75 1 1.25 1.5 2 3 4 5 ; show-text "Speed: ${speed}x"',
    'F7 cycle-values speed 5 4 3 2 1.5 1.25 1 0.75 0.5 ; show-text "Speed: ${speed}x"',
    'F8 set speed 1 ; show-text "Speed: 1x"',
    'F9 add cache-secs -30 ; show-text "Cache target: ${cache-secs}s"',
    'F10 add cache-secs 30 ; show-text "Cache target: ${cache-secs}s"',
    '',
  ].join('\n');
}

function escapeAssText(value: string): string {
  return value.replace(/[\\{}]/gu, (match) => `\\${match}`).replace(/\r?\n/gu, ' ');
}

function toLuaLongString(value: string): string {
  let delimiterSize = 1;

  while (value.includes(`]${'='.repeat(delimiterSize)}]`)) {
    delimiterSize += 1;
  }

  const delimiter = '='.repeat(delimiterSize);
  return `[${delimiter}[${value}]${delimiter}]`;
}

function splitPlaybackTitle(title: string): { displayTitle: string; displaySubtitle: string } {
  const parts = title
    .split(' - ')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 3 && /^S\d+\s*:\s*E\d+/iu.test(parts[1])) {
    return {
      displayTitle: parts[0],
      displaySubtitle: parts.slice(1).join(' - '),
    };
  }

  return {
    displayTitle: title.trim() || 'Taluxa',
    displaySubtitle: '',
  };
}

function createMpvUiScript(title: string): string {
  const { displayTitle, displaySubtitle } = splitPlaybackTitle(title);

  return String.raw`
local mp = require 'mp'
local overlay = mp.create_osd_overlay('ass-events')

local UI_WIDTH = 1920
local UI_HEIGHT = 1080
local BUTTON_SCALE = 2
local display_title = ${toLuaLongString(escapeAssText(displayTitle))}
local display_subtitle = ${toLuaLongString(escapeAssText(displaySubtitle))}
local SPEED_OPTIONS = {'0.5', '0.75', '1', '1.25', '1.5', '2', '3', '4', '5'}
local audio_tracks = {}
local buttons = {}
local cache_speed = 0
local duration = 0
local menu_open = nil
local muted = false
local paused = false
local playback_speed = 1
local position = 0
local volume = 100

local function clamp(value, min_value, max_value)
  value = tonumber(value) or min_value
  if value < min_value then return min_value end
  if value > max_value then return max_value end
  return value
end

local function format_clock(value)
  value = math.max(0, math.floor(tonumber(value) or 0))
  local hours = math.floor(value / 3600)
  local minutes = math.floor((value % 3600) / 60)
  local seconds = value % 60
  if hours > 0 then
    return string.format('%d:%02d:%02d', hours, minutes, seconds)
  end
  return string.format('%d:%02d', minutes, seconds)
end

local function format_speed(value)
  value = tonumber(value) or 0
  local units = {'B/s', 'KB/s', 'MB/s', 'GB/s'}
  local unit = 1
  while value >= 1024 and unit < #units do
    value = value / 1024
    unit = unit + 1
  end
  if unit == 1 then
    return string.format('%d %s', value, units[unit])
  end
  return string.format('%.1f %s', value, units[unit])
end

local function append_box(out, x1, y1, x2, y2, color, alpha)
  out[#out + 1] = string.format(
    '{\\an7\\pos(0,0)\\bord0\\shad0\\alpha&H%02X&\\c&H%s&\\p1}m %d %d l %d %d l %d %d l %d %d{\\p0}',
    alpha, color, x1, y1, x2, y1, x2, y2, x1, y2
  )
end

local function append_text(out, x, y, align, size, text, color, alpha, bold)
  local weight = bold and '\\b1' or '\\b0'
  text = tostring(text or ''):gsub('\\', '\\\\'):gsub('{', '\\{'):gsub('}', '\\}')
  out[#out + 1] = string.format(
    '{\\an%d\\pos(%d,%d)\\fs%d%s\\alpha&H%02X&\\c&H%s&\\3c&H000000&\\bord1.1\\shad0}%s',
    align, x, y, size, weight, alpha, color, text
  )
end

local function add_button(out, id, x, y, width, height, label, size, value)
  buttons[#buttons + 1] = { id = id, x1 = x, y1 = y, x2 = x + width, y2 = y + height, value = value }
  append_text(out, x + math.floor(width / 2), y + math.floor(height / 2) + 1, 5, size or 22, label, 'FFFFFF', 0, false)
end

local function add_range_button(id, x1, y1, x2, y2)
  buttons[#buttons + 1] = { id = id, x1 = x1, y1 = y1, x2 = x2, y2 = y2 }
end

local function update_audio_tracks(value)
  audio_tracks = {}
  for _, track in ipairs(value or {}) do
    if track.type == 'audio' then
      local label = track.title or track.lang or ('Audio ' .. tostring(track.id))
      audio_tracks[#audio_tracks + 1] = { id = track.id, label = label }
    end
  end
  if #audio_tracks == 0 then
    audio_tracks[1] = { id = 'no', label = 'No audio' }
  end
end

local function normalize_mouse_pos(pos)
  if not pos then return nil end
  local raw_width = mp.get_property_number('osd-width', UI_WIDTH)
  local raw_height = mp.get_property_number('osd-height', UI_HEIGHT)
  return {
    x = (pos.x or 0) * UI_WIDTH / math.max(1, raw_width),
    y = (pos.y or 0) * UI_HEIGHT / math.max(1, raw_height),
  }
end

local function draw_options_menu(out)
  if not menu_open then return end

  local width = UI_WIDTH
  local height = UI_HEIGHT
  local item_height = 46
  local menu_width = menu_open == 'audio' and 260 or 112
  local right = width - 640
  local anchor_x = menu_open == 'audio' and (right + 122) or right
  local options = {}

  if menu_open == 'speed' then
    for _, value in ipairs(SPEED_OPTIONS) do
      options[#options + 1] = { id = 'speed-option', value = value, label = value .. 'x' }
    end
  elseif menu_open == 'audio' then
    for _, track in ipairs(audio_tracks) do
      options[#options + 1] = { id = 'audio-option', value = track.id, label = track.label }
    end
  end

  local menu_height = math.max(item_height, #options * item_height)
  local x = math.min(width - menu_width - 28, anchor_x)
  local y = height - 128 - menu_height
  append_box(out, x, y, x + menu_width, y + menu_height, '101010', 35)

  for index, option in ipairs(options) do
    local item_y = y + (index - 1) * item_height
    local label = option.label
    add_button(out, option.id, x, item_y, menu_width, item_height, label, 24, option.value)
  end
end

local function draw_controls()
  local width = UI_WIDTH
  local height = UI_HEIGHT
  local out = {}
  buttons = {}
  overlay.res_x = width
  overlay.res_y = height

  local progress = 0
  if duration > 0 then
    progress = clamp(position / duration, 0, 1)
  end
  local remaining = math.max(0, duration - position)
  local bottom = height
  local bar_y = height - 78
  local title_y = height - 126
  local subtitle_y = height - 98
  local controls_y = height - 42
  local bar_left = 74
  local bar_right = width - 90
  local bar_width = math.max(1, bar_right - bar_left)
  local progress_x = bar_left + math.floor(bar_width * progress)

  append_box(out, 0, height - 210, width, bottom, '000000', 130)

  append_text(out, 24, title_y, 1, 30, display_title, 'FFFFFF', 0, true)
  if display_subtitle ~= '' then
    append_text(out, 24, subtitle_y, 1, 18, display_subtitle, 'E6E6E6', 0, false)
  end

  append_text(out, 24, bar_y + 5, 4, 16, format_clock(position), 'FFFFFF', 0, false)
  append_text(out, width - 24, bar_y + 5, 6, 16, format_clock(remaining), 'FFFFFF', 0, false)
  append_box(out, bar_left, bar_y - 1, bar_right, bar_y + 1, 'CFCFCF', 80)
  append_box(out, bar_left, bar_y - 2, progress_x, bar_y + 2, 'B35CFF', 0)
  append_box(out, progress_x - 7, bar_y - 7, progress_x + 7, bar_y + 7, 'B35CFF', 0)
  add_range_button('seek', bar_left, bar_y - 12, bar_right, bar_y + 12)

  local button_height = 36 * BUTTON_SCALE
  local icon_button = 36 * BUTTON_SCALE
  local button_y = controls_y - math.floor(button_height / 2)
  add_button(out, 'prev', 24, button_y, icon_button, button_height, '|<', 42)
  add_button(out, 'play', 104, button_y, icon_button, button_height, paused and '\226\150\182' or 'II', 43)
  add_button(out, 'next', 184, button_y, icon_button, button_height, '>|', 42)
  add_button(out, 'mute', 286, button_y, icon_button, button_height, muted and 'x' or '\226\153\170', 42)
  append_box(out, 374, controls_y - 3, 526, controls_y + 3, 'D0D0D0', 115)
  append_box(out, 374, controls_y - 4, 374 + math.floor(152 * clamp(volume / 100, 0, 1)), controls_y + 4, 'B35CFF', 0)
  append_box(out, 374 + math.floor(152 * clamp(volume / 100, 0, 1)) - 8, controls_y - 9, 374 + math.floor(152 * clamp(volume / 100, 0, 1)) + 8, controls_y + 9, 'B35CFF', 0)
  add_range_button('volume', 360, controls_y - 18, 540, controls_y + 18)

  local right = width - 640
  add_button(out, 'speed', right, button_y, 96, button_height, string.format('%.1fx', playback_speed), 28)
  add_button(out, 'audio', right + 122, button_y, icon_button, button_height, '\226\153\170', 42)
  add_button(out, 'sub', right + 204, button_y, icon_button, button_height, 'CC', 28)
  add_button(out, 'danmaku', right + 286, button_y, icon_button, button_height, 'DM', 28)
  add_button(out, 'settings', right + 368, button_y, icon_button, button_height, '\226\154\153', 40)
  add_button(out, 'fullscreen', right + 532, button_y, icon_button, button_height, '[ ]', 30)

  draw_options_menu(out)

  append_text(out, width - 18, 46, 3, 14, format_speed(cache_speed), 'FFFFFF', 0, false)
  add_button(out, 'pin', width - 146, 8, 28, 24, '*', 17)
  add_button(out, 'minimize', width - 110, 8, 28, 24, '-', 18)
  add_button(out, 'maximize', width - 74, 8, 28, 24, '[]', 17)
  add_button(out, 'close', width - 38, 8, 28, 24, 'x', 20)

  overlay.data = table.concat(out, '\n')
  overlay:update()
end

local function button_at(x, y)
  for _, button in ipairs(buttons) do
    if x >= button.x1 and x <= button.x2 and y >= button.y1 and y <= button.y2 then
      return button.id, button
    end
  end
  return nil, nil
end

local function handle_click()
  local pos = normalize_mouse_pos(mp.get_property_native('mouse-pos'))
  if not pos then return end
  local id, button = button_at(pos.x or 0, pos.y or 0)
  if not id then
    if menu_open then
      menu_open = nil
      draw_controls()
    end
    return
  end

  if id == 'seek' and duration > 0 then
    menu_open = nil
    local ratio = clamp(((pos.x or button.x1) - button.x1) / math.max(1, button.x2 - button.x1), 0, 1)
    mp.commandv('set', 'time-pos', duration * ratio)
  elseif id == 'volume' then
    menu_open = nil
    local ratio = clamp(((pos.x or button.x1) - button.x1) / math.max(1, button.x2 - button.x1), 0, 1)
    mp.commandv('set', 'volume', math.floor(ratio * 100))
  elseif id == 'speed-option' then
    mp.commandv('set', 'speed', tostring(button.value))
    menu_open = nil
  elseif id == 'audio-option' then
    if button.value ~= 'no' then
      mp.commandv('set', 'aid', tostring(button.value))
    end
    menu_open = nil
  elseif id == 'prev' then
    menu_open = nil
    mp.commandv('playlist-prev')
  elseif id == 'play' then
    menu_open = nil
    mp.commandv('cycle', 'pause')
  elseif id == 'next' then
    menu_open = nil
    mp.commandv('playlist-next')
  elseif id == 'mute' then
    menu_open = nil
    mp.commandv('cycle', 'mute')
  elseif id == 'speed' then
    if menu_open == 'speed' then
      menu_open = nil
    else
      menu_open = 'speed'
    end
  elseif id == 'audio' then
    if menu_open == 'audio' then
      menu_open = nil
    else
      menu_open = 'audio'
    end
  elseif id == 'sub' then
    menu_open = nil
    mp.commandv('cycle', 'sid')
  elseif id == 'danmaku' then
    menu_open = nil
    mp.commandv('show-text', 'Danmaku is not available yet', '1500')
  elseif id == 'settings' then
    menu_open = nil
    mp.commandv('show-text', 'F6/F7 speed  F9/F10 cache', '2500')
  elseif id == 'fullscreen' then
    menu_open = nil
    mp.commandv('cycle', 'fullscreen')
  elseif id == 'minimize' then
    menu_open = nil
    mp.commandv('set', 'window-minimized', 'yes')
  elseif id == 'maximize' then
    menu_open = nil
    mp.commandv('cycle', 'window-maximized')
  elseif id == 'close' then
    mp.commandv('quit')
  end
  draw_controls()
end

local function handle_wheel(delta)
  local pos = normalize_mouse_pos(mp.get_property_native('mouse-pos'))
  if pos then
    local id = button_at(pos.x or 0, pos.y or 0)
    if id == 'speed' then
      mp.commandv('add', 'speed', delta > 0 and '0.25' or '-0.25')
      return
    end
  end
  mp.commandv('add', 'volume', delta > 0 and '5' or '-5')
end

mp.observe_property('cache-speed', 'native', function(_, value) cache_speed = value or 0; draw_controls() end)
mp.observe_property('duration', 'number', function(_, value) duration = value or 0; draw_controls() end)
mp.observe_property('time-pos', 'number', function(_, value) position = value or 0; draw_controls() end)
mp.observe_property('pause', 'bool', function(_, value) paused = value or false; draw_controls() end)
mp.observe_property('speed', 'number', function(_, value) playback_speed = value or 1; draw_controls() end)
mp.observe_property('volume', 'number', function(_, value) volume = value or 0; draw_controls() end)
mp.observe_property('mute', 'bool', function(_, value) muted = value or false; draw_controls() end)
mp.observe_property('track-list', 'native', function(_, value) update_audio_tracks(value); draw_controls() end)
mp.observe_property('osd-width', 'native', draw_controls)
mp.observe_property('osd-height', 'native', draw_controls)
mp.add_forced_key_binding('MBTN_LEFT', 'taluxa-click', handle_click)
mp.add_forced_key_binding('WHEEL_UP', 'taluxa-wheel-up', function() handle_wheel(1) end)
mp.add_forced_key_binding('WHEEL_DOWN', 'taluxa-wheel-down', function() handle_wheel(-1) end)
mp.add_periodic_timer(1, draw_controls)
update_audio_tracks(mp.get_property_native('track-list'))
draw_controls()
`.trimStart();
}

export interface MpvControllerOptions {
  connectIpc?: ConnectIpc;
  connectRetryDelayMs?: number;
  connectTimeoutMs?: number;
  createInputConfigFilePath?: (sessionId: number) => string;
  createUiScriptFilePath?: (sessionId: number) => string;
  createLogFilePath?: (sessionId: number) => string;
  createIpcEndpoint?: () => string;
  fileExists?: (targetPath: string) => boolean;
  isPackaged?: boolean;
  maxConnectAttempts?: number;
  moduleDir?: string;
  onProgress?: (snapshot: MpvProgressSnapshot) => void;
  readTextFile?: (targetPath: string) => string;
  resourcesPath?: string;
  spawnProcess?: SpawnProcess;
  writeTextFile?: (targetPath: string, content: string) => void;
}

function findWorkspaceRoot(startDir: string, fileExists: (targetPath: string) => boolean): string | null {
  let currentDir = path.resolve(startDir);

  while (true) {
    if (fileExists(path.join(currentDir, 'package.json'))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

function normalizeStartSeconds(startSeconds?: number): number {
  if (!Number.isFinite(startSeconds)) {
    return 0;
  }

  return Math.max(0, Math.floor(startSeconds ?? 0));
}

function normalizeObservedSeconds(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null;
}

function isPlaybackReadyProperty(name: unknown, value: unknown): boolean {
  const observedSeconds = normalizeObservedSeconds(value);

  if (observedSeconds === null) {
    return false;
  }

  return name === 'time-pos' || (name === 'duration' && observedSeconds > 0);
}

function isRetryableIpcError(error: Error): boolean {
  const errorCode = (error as NodeJS.ErrnoException).code;

  return errorCode === 'ECONNREFUSED' || errorCode === 'ENOENT';
}

function isLocalHttpUrl(streamUrl: string): boolean {
  try {
    const { hostname, protocol } = new URL(streamUrl);

    return (
      (protocol === 'http:' || protocol === 'https:') &&
      (hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1')
    );
  } catch {
    return false;
  }
}

function getProxyArgs(proxy: ProxySettings): string[] {
  if (proxy.mode === 'direct') {
    return ['--http-proxy='];
  }

  if (isCustomProxyConfigured(proxy)) {
    return [`--http-proxy=${proxy.customProxyUrl.trim()}`];
  }

  return [];
}

function getPlaybackProxyArgs(streamUrl: string, proxy: ProxySettings): string[] {
  if (isLocalHttpUrl(streamUrl)) {
    return ['--http-proxy='];
  }

  return getProxyArgs(proxy);
}

function getHttpHeaderArgs(httpHeaders: Record<string, string> | undefined): string[] {
  const headerEntries = Object.entries(httpHeaders ?? {}).filter(
    ([name, value]) => name.trim() && value.trim()
  );

  if (headerEntries.length === 0) {
    return [];
  }

  return [
    `--http-header-fields=${headerEntries
      .map(([name, value]) => `${name.trim()}: ${value.trim()}`)
      .join(',')}`,
    `--demuxer-lavf-o=headers=${headerEntries
      .map(([name, value]) => `${name.trim()}: ${value.trim()}`)
      .join('\r\n')}\r\n`,
  ];
}

function appendDiagnosticSegment(message: string, label: string, detail: string): string {
  const normalizedDetail = detail.trim();

  if (!normalizedDetail) {
    return message;
  }

  return `${message} ${label}: ${normalizedDetail}`;
}

function formatMpvPayload(payload: Record<string, unknown>): string {
  return JSON.stringify(payload);
}

function normalizeFailureDetail(detail: unknown): string {
  return typeof detail === 'string' ? detail.trim() : '';
}

function redactSensitivePlaybackText(value: string): string {
  return value
    .replace(/([?&]api_key=)[^&\s]+/giu, '$1[redacted]')
    .replace(/(X-Emby-Token:\s*)[^\s|]+/giu, '$1[redacted]')
    .replace(/(MediaBrowser Token=")[^"]+(")/giu, '$1[redacted]$2');
}

export class MpvController {
  private activeSession: ActiveSession | null = null;

  private readonly connectIpc: ConnectIpc;

  private readonly connectRetryDelayMs: number;

  private readonly connectTimeoutMs: number;

  private readonly createIpcEndpoint: () => string;

  private readonly createInputConfigFilePath: (sessionId: number) => string;

  private readonly createUiScriptFilePath: (sessionId: number) => string;

  private readonly createLogFilePath: (sessionId: number) => string;

  private readonly fileExists: (targetPath: string) => boolean;

  private ipcEndpointCounter = 0;

  private readonly isPackaged: boolean;

  private readonly maxConnectAttempts: number;

  private readonly moduleDir: string;

  private readonly onProgress: (snapshot: MpvProgressSnapshot) => void;

  private readonly readTextFile: (targetPath: string) => string;

  private readonly resourcesPath: string;

  private sessionCounter = 0;

  private readonly spawnProcess: SpawnProcess;

  private readonly writeTextFile: (targetPath: string, content: string) => void;

  constructor(options: MpvControllerOptions = {}) {
    this.connectIpc = options.connectIpc ?? ((ipcServerPath) => createConnection(ipcServerPath));
    this.connectRetryDelayMs = options.connectRetryDelayMs ?? 100;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 5000;
    this.createIpcEndpoint =
      options.createIpcEndpoint ?? (() => this.createDefaultIpcEndpoint());
    this.createInputConfigFilePath =
      options.createInputConfigFilePath ??
      ((sessionId) =>
        path.join(os.tmpdir(), `emby-player-mpv-input-${process.pid}-${sessionId}.conf`));
    this.createUiScriptFilePath =
      options.createUiScriptFilePath ??
      ((sessionId) =>
        path.join(os.tmpdir(), `emby-player-mpv-ui-${process.pid}-${sessionId}.lua`));
    this.createLogFilePath =
      options.createLogFilePath ??
      ((sessionId) => path.join(os.tmpdir(), `emby-player-mpv-${process.pid}-${sessionId}.log`));
    this.fileExists = options.fileExists ?? existsSync;
    this.isPackaged = options.isPackaged ?? process.env.NODE_ENV === 'production';
    this.maxConnectAttempts = options.maxConnectAttempts ?? 20;
    this.moduleDir = options.moduleDir ?? path.dirname(fileURLToPath(import.meta.url));
    this.onProgress = options.onProgress ?? (() => undefined);
    this.readTextFile =
      options.readTextFile ?? ((targetPath) => readFileSync(targetPath, 'utf8'));
    this.resourcesPath = options.resourcesPath ?? process.resourcesPath;
    this.spawnProcess = options.spawnProcess ?? ((command, args, spawnOptions) =>
      spawn(command, args, spawnOptions));
    this.writeTextFile =
      options.writeTextFile ?? ((targetPath, content) => writeFileSync(targetPath, content, 'utf8'));
  }

  getExecutablePath(): string {
    const executablePath = this.isPackaged
      ? path.join(this.resourcesPath, 'vendor', 'mpv', 'windows-x64', 'mpv.exe')
      : this.getDevelopmentExecutablePath();

    if (!this.fileExists(executablePath)) {
      throw new Error(`Bundled mpv runtime was not found at ${executablePath}.`);
    }

    return executablePath;
  }

  async launch(input: LaunchMpvInput, proxy: ProxySettings): Promise<void> {
    const executablePath = this.getExecutablePath();
    const ipcServerPath = this.createIpcEndpoint();
    const sessionId = ++this.sessionCounter;
    const inputConfigFilePath = this.createInputConfigFilePath(sessionId);
    const uiScriptFilePath = this.createUiScriptFilePath(sessionId);
    const logFilePath = this.createLogFilePath(sessionId);
    this.writeTextFile(inputConfigFilePath, createMpvInputConfig());
    this.writeTextFile(uiScriptFilePath, createMpvUiScript(input.title));
    const args = [
      '--force-window=yes',
      '--border=no',
      '--osc=no',
      `--input-ipc-server=${ipcServerPath}`,
      `--input-conf=${inputConfigFilePath}`,
      `--script=${uiScriptFilePath}`,
      `--title=${input.title}`,
      `--start=${normalizeStartSeconds(input.startSeconds)}`,
      '--osd-font=Microsoft YaHei UI',
      '--osd-duration=1500',
      '--cache=yes',
      `--cache-secs=${DEFAULT_CACHE_SECONDS}`,
      '--msg-level=all=v',
      `--log-file=${logFilePath}`,
      '--ytdl=no',
      ...getHttpHeaderArgs(input.httpHeaders),
      ...getPlaybackProxyArgs(input.streamUrl, proxy),
      input.streamUrl,
    ];

    this.replaceActiveSession();

    await new Promise<void>((resolve, reject) => {
      let child: SpawnedMpvProcess;
      let launchSettled = false;
      const stderrLines: string[] = [];

      const settleLaunch = (settler: () => void) => {
        if (launchSettled) {
          return;
        }

        launchSettled = true;
        settler();
      };

      try {
        child = this.spawnProcess(executablePath, args, {
          stdio: ['ignore', 'ignore', 'pipe'],
          windowsHide: true,
        });
      } catch (error) {
        reject(error);
        return;
      }

      child.stderr?.on('data', (chunk) => {
        const nextLines = String(chunk)
          .split(/\r?\n/u)
          .map((line) => line.trim())
          .filter(Boolean);

        if (nextLines.length === 0) {
          return;
        }

        stderrLines.push(...nextLines);
        if (stderrLines.length > MAX_STDERR_LINES) {
          stderrLines.splice(0, stderrLines.length - MAX_STDERR_LINES);
        }
      });

      const handleSpawn = () => {
        child.removeListener('error', handleError);
        child.once('exit', handleExit);
        this.startSession({
          child,
          sessionId,
          itemId: input.itemId,
          ipcServerPath,
          logFilePath,
          onFailure: (error) => {
            settleLaunch(() => reject(error));
          },
          onReady: () => {
            settleLaunch(resolve);
          },
          stderrLines,
        });
        child.unref();
      };
      const handleError = (error: Error) => {
        child.removeListener('spawn', handleSpawn);
        settleLaunch(() => reject(error));
      };
      const handleExit = () => {
        const activeSession = this.activeSession;

        if (!this.isActiveSession(sessionId) || activeSession?.isReady || !activeSession) {
          return;
        }

        activeSession.onFailure(
          new Error(
            this.buildFailureMessage(
              'mpv exited before playback became ready.',
              activeSession.stderrLines,
              activeSession.logFilePath
            )
          )
        );
        this.clearActiveSession();
      };

      child.once('spawn', handleSpawn);
      child.once('error', handleError);
    });
  }

  private clearActiveSession(): void {
    if (!this.activeSession) {
      return;
    }

    const session = this.activeSession;

    if (session.retryTimeout) {
      clearTimeout(session.retryTimeout);
    }

    if (session.connectTimeout) {
      clearTimeout(session.connectTimeout);
    }

    if (session.readyFallbackTimeout) {
      clearTimeout(session.readyFallbackTimeout);
    }

    session.client?.destroy();
    session.child.kill?.();
    this.activeSession = null;
  }

  private replaceActiveSession(): void {
    const session = this.activeSession;

    if (session && !session.isReady) {
      this.markSessionReady(session);
    }

    this.clearActiveSession();
  }

  private connectSession(session: ActiveSession): void {
    if (!this.isActiveSession(session.sessionId)) {
      return;
    }

    const client = this.connectIpc(session.ipcServerPath);
    session.client = client;

    client.setEncoding?.('utf8');
    client.on('connect', () => {
      if (!this.isActiveSession(session.sessionId)) {
        return;
      }

      session.connectAttempt = 0;
      session.hasConnected = true;
      session.readyFallbackTimeout = setTimeout(() => {
        if (this.isActiveSession(session.sessionId)) {
          this.markSessionReady(session);
        }
      }, IPC_CONNECTED_READY_FALLBACK_MS);
      this.observeProperty(client, 1, 'time-pos');
      this.observeProperty(client, 2, 'duration');
    });
    client.on('data', (chunk) => {
      this.handleIpcData(session.sessionId, chunk);
    });
    client.on('close', () => {
      if (this.isActiveSession(session.sessionId) && session.client === client) {
        if (!session.isReady) {
          session.onFailure(
            new Error(
              this.buildFailureMessage(
                'mpv closed before playback became ready.',
                session.stderrLines,
                session.logFilePath
              )
            )
          );
        }
        this.clearActiveSession();
      }
    });
    client.on('error', (error) => {
      if (!this.isActiveSession(session.sessionId)) {
        return;
      }

      client.destroy();
      session.client = null;

      if (isRetryableIpcError(error) && session.connectAttempt < this.maxConnectAttempts) {
        session.connectAttempt += 1;
        session.retryTimeout = setTimeout(() => {
          session.retryTimeout = null;
          this.connectSession(session);
        }, this.connectRetryDelayMs);
        return;
      }

      if (!session.isReady) {
        session.onFailure(
          new Error(
            this.buildFailureMessage(
              session.hasConnected
                ? 'mpv connected but could not load the selected media.'
                : 'Could not connect to mpv playback bridge.',
              session.stderrLines,
              session.logFilePath
            )
          )
        );
      }
      this.clearActiveSession();
    });
  }

  private createDefaultIpcEndpoint(): string {
    this.ipcEndpointCounter += 1;
    return String.raw`\\.\pipe\emby-player-${process.pid}-${Date.now()}-${this.ipcEndpointCounter}`;
  }

  private emitProgress(session: ActiveSession): void {
    if (session.positionSeconds === null) {
      return;
    }

    this.onProgress({
      itemId: session.itemId,
      positionSeconds: Math.floor(session.positionSeconds),
      durationSeconds: Math.floor(session.durationSeconds),
    });
  }

  private getDevelopmentExecutablePath(): string {
    const workspaceRoot = findWorkspaceRoot(this.moduleDir, this.fileExists);

    if (!workspaceRoot) {
      throw new Error(`Unable to locate the workspace root from ${this.moduleDir}.`);
    }

    return path.join(workspaceRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
  }

  private handleIpcData(sessionId: number, chunk: Buffer | string): void {
    const session = this.activeSession;

    if (!session || session.sessionId !== sessionId) {
      return;
    }

    session.buffer += String(chunk);
    const messages = session.buffer.split('\n');
    session.buffer = messages.pop() ?? '';

    for (const message of messages) {
      const trimmedMessage = message.trim();

      if (!trimmedMessage) {
        continue;
      }

      try {
        const payload = JSON.parse(trimmedMessage) as {
          [key: string]: unknown;
          data?: unknown;
          event?: string;
          error?: string;
          file_error?: string;
          name?: string;
          reason?: string;
        };

        if (payload.event === 'file-loaded') {
          this.markSessionReady(session);
          continue;
        }

        if (payload.event === 'end-file' && !session.isReady) {
          const errorDetail =
            normalizeFailureDetail(payload.error) ||
            normalizeFailureDetail(payload.file_error) ||
            (payload.reason === 'error'
              ? 'mpv reported a playback error before the media loaded.'
              : `mpv ended playback before the media loaded (${payload.reason ?? 'unknown'}).`);
          session.onFailure(
            new Error(
              this.buildFailureMessage(
                errorDetail,
                session.stderrLines,
                session.logFilePath,
                payload
              )
            )
          );
          this.clearActiveSession();
          continue;
        }

        if (payload.event !== 'property-change') {
          continue;
        }

        if (!session.isReady && isPlaybackReadyProperty(payload.name, payload.data)) {
          this.markSessionReady(session);
        }

        if (payload.name === 'duration') {
          session.durationSeconds = normalizeObservedSeconds(payload.data) ?? 0;
          this.emitProgress(session);
          continue;
        }

        if (payload.name === 'time-pos') {
          session.positionSeconds = normalizeObservedSeconds(payload.data);
          this.emitProgress(session);
        }
      } catch {
        // Ignore malformed IPC payloads from a stale or interrupted mpv session.
      }
    }
  }

  private isActiveSession(sessionId: number): boolean {
    return this.activeSession?.sessionId === sessionId;
  }

  private markSessionReady(session: ActiveSession): void {
    if (session.isReady) {
      return;
    }

    session.isReady = true;
    if (session.connectTimeout) {
      clearTimeout(session.connectTimeout);
      session.connectTimeout = null;
    }
    if (session.readyFallbackTimeout) {
      clearTimeout(session.readyFallbackTimeout);
      session.readyFallbackTimeout = null;
    }
    session.onReady();
  }

  private observeProperty(
    client: MpvIpcClient,
    requestId: number,
    propertyName: 'duration' | 'time-pos'
  ): void {
    this.writeCommand(client, ['observe_property', requestId, propertyName]);
  }

  private writeCommand(client: MpvIpcClient, command: unknown[]): void {
    client.write(`${JSON.stringify({ command })}\n`);
  }

  private startSession({
    child,
    ipcServerPath,
    itemId,
    logFilePath,
    onFailure,
    onReady,
    sessionId,
    stderrLines,
  }: {
    child: SpawnedMpvProcess;
    ipcServerPath: string;
    itemId: string;
    logFilePath: string;
    onFailure: (error: Error) => void;
    onReady: () => void;
    sessionId: number;
    stderrLines: string[];
  }): void {
    const session: ActiveSession = {
      buffer: '',
      child,
      client: null,
      connectAttempt: 0,
      connectTimeout: null,
      durationSeconds: 0,
      hasConnected: false,
      ipcServerPath,
      isReady: false,
      itemId,
      logFilePath,
      onFailure,
      onReady,
      positionSeconds: null,
      readyFallbackTimeout: null,
      retryTimeout: null,
      sessionId,
      stderrLines,
    };

    this.activeSession = session;
    session.connectTimeout = setTimeout(() => {
      if (!this.isActiveSession(session.sessionId) || session.isReady) {
        return;
      }

      session.onFailure(
        new Error(
          this.buildFailureMessage(
            'Timed out waiting for mpv to become ready.',
            session.stderrLines,
            session.logFilePath
          )
        )
      );
      this.clearActiveSession();
    }, this.connectTimeoutMs);
    this.connectSession(session);
  }

  private buildFailureMessage(
    baseMessage: string,
    stderrLines: string[],
    logFilePath: string,
    payload?: Record<string, unknown>
  ): string {
    let nextMessage = baseMessage;

    if (payload) {
      nextMessage = appendDiagnosticSegment(nextMessage, 'Event', formatMpvPayload(payload));
    }

    if (stderrLines.length > 0) {
      nextMessage = appendDiagnosticSegment(
        nextMessage,
        'mpv stderr',
        stderrLines.join(' | ')
      );
    }

    const logLines = this.readRecentLogLines(logFilePath);

    if (logLines.length > 0) {
      nextMessage = appendDiagnosticSegment(nextMessage, 'mpv log', logLines.join(' | '));
    }

    return nextMessage;
  }

  private readRecentLogLines(logFilePath: string): string[] {
    try {
      return this.readTextFile(logFilePath)
        .split(/\r?\n/u)
        .map((line) => redactSensitivePlaybackText(line.trim()))
        .filter(Boolean)
        .slice(-MAX_LOG_LINES);
    } catch {
      return [];
    }
  }
}
