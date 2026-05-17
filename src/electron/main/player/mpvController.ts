import { spawn, type SpawnOptions } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createDefaultSettings,
  type PlaybackSettings,
  type SubtitleSettings,
  DanmakuServerSettings,
  DanmakuSettings,
  ProxySettings,
} from '@shared/models/settings';
import { isCustomProxyConfigured } from '@shared/network/proxy';
import {
  DanmakuSourceError,
  fetchDandanplayDanmaku,
  formatDanmakuDiagnosticText,
  toAssSubtitle,
  type DanmakuComment,
} from './danmaku';

export interface LaunchMpvInput {
  episodeSelector?: LaunchMpvEpisodeSelector;
  httpHeaders?: Record<string, string>;
  itemId: string;
  streamUrl: string;
  title: string;
  startSeconds?: number;
}

export interface LaunchMpvEpisodeSelector {
  currentItemId: string;
  episodes: LaunchMpvEpisodeSelectorItem[];
}

export interface LaunchMpvEpisodeSelectorItem {
  durationSeconds?: number | null;
  itemId: string;
  thumbnailHeight?: number | null;
  thumbnailPath?: string | null;
  thumbnailStride?: number | null;
  thumbnailUrl?: string | null;
  thumbnailWidth?: number | null;
  title: string;
}

export interface MpvProgressSnapshot {
  itemId: string;
  positionSeconds: number;
  durationSeconds: number;
}

export interface MpvWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlayerSettingsPatch {
  playback?: Partial<PlaybackSettings>;
  subtitles?: Partial<SubtitleSettings>;
  danmaku?: Partial<DanmakuSettings>;
}

export interface LaunchPlayerSettings {
  playback: PlaybackSettings;
  subtitles: SubtitleSettings;
  danmakuServers: DanmakuServerSettings[];
  danmaku: DanmakuSettings;
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
type FetchDanmaku = (
  input: Pick<LaunchMpvInput, 'itemId' | 'title'>,
  servers: DanmakuServerSettings[]
) => Promise<DanmakuComment[]>;

interface ActiveSession {
  buffer: string;
  child: SpawnedMpvProcess;
  client: MpvIpcClient | null;
  connectAttempt: number;
  connectTimeout: NodeJS.Timeout | null;
  danmakuComments: DanmakuComment[];
  danmakuFilePath: string;
  danmakuSettings: DanmakuSettings;
  durationSeconds: number;
  hasConnected: boolean;
  hasDanmakuSubtitle: boolean;
  ipcServerPath: string;
  isReady: boolean;
  itemId: string;
  onFailure: (error: Error) => void;
  onReady: () => void;
  pendingCommands: unknown[][];
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
const DANMAKU_NO_MATCH_NOTICE = '\u672a\u5339\u914d\u5230\u5f39\u5e55';
const DANMAKU_SOURCE_ERROR_NOTICE =
  '\u5f39\u5e55\u6e90\u8bf7\u6c42\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u5f39\u5e55 API \u5730\u5740\u6216\u51ed\u8bc1';

function formatDanmakuNoticeTime(timeSeconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(timeSeconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function createDanmakuMatchedNotice(comments: DanmakuComment[]): string {
  const commentCount = comments.length;
  const baseNotice = `\u5df2\u5339\u914d\u5230\u5f39\u5e55\uff1a${commentCount} \u6761`;

  const sampleComment = comments.find((comment) => comment.text.trim().length > 0);

  if (!sampleComment) {
    return baseNotice;
  }

  const sampleText = sampleComment.text.replace(/\s+/gu, ' ').trim();
  const previewText = sampleText.length > 48 ? `${sampleText.slice(0, 48)}...` : sampleText;

  return `${baseNotice}\n${formatDanmakuNoticeTime(sampleComment.timeSeconds)} ${previewText}`;
}

function isDanmakuSourceError(error: unknown): boolean {
  return (
    error instanceof DanmakuSourceError ||
    (error instanceof Error &&
      (error.name === 'DanmakuSourceError' || error.message.startsWith('Danmaku sources failed')))
  );
}

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

function toLuaSingleQuotedString(value: string): string {
  return `'${value.replace(/\\/gu, '\\\\').replace(/'/gu, "\\'")}'`;
}

function formatEpisodeDurationLabel(durationSeconds: number | null | undefined): string {
  if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return '';
  }

  return `${Math.max(1, Math.round(durationSeconds / 60))}min`;
}

function normalizeEpisodeSelector(
  episodeSelector: LaunchMpvEpisodeSelector | undefined
): LaunchMpvEpisodeSelector | null {
  const currentItemId = episodeSelector?.currentItemId?.trim();
  const episodes =
    episodeSelector?.episodes
      .map((episode) => ({
        ...episode,
        itemId: episode.itemId.trim(),
        title: episode.title.trim(),
      }))
      .filter((episode) => episode.itemId && episode.title) ?? [];

  if (!currentItemId || episodes.length === 0) {
    return null;
  }

  return {
    currentItemId,
    episodes,
  };
}

function toLuaEpisodeItems(episodeSelector: LaunchMpvEpisodeSelector | undefined): string {
  const normalizedSelector = normalizeEpisodeSelector(episodeSelector);

  if (!normalizedSelector) {
    return '{}';
  }

  const rows = normalizedSelector.episodes.map((episode) => {
    const durationLabel = formatEpisodeDurationLabel(episode.durationSeconds);

    return [
      '  {',
      `    item_id = ${toLuaLongString(episode.itemId)},`,
      `    title = ${toLuaLongString(escapeAssText(episode.title))},`,
      `    duration = ${toLuaLongString(escapeAssText(durationLabel))},`,
      `    thumbnail_height = ${episode.thumbnailHeight ?? 0},`,
      `    thumbnail_path = ${toLuaLongString(episode.thumbnailPath ?? '')},`,
      `    thumbnail_stride = ${episode.thumbnailStride ?? 0},`,
      `    thumbnail_url = ${toLuaLongString(episode.thumbnailUrl ?? '')},`,
      `    thumbnail_width = ${episode.thumbnailWidth ?? 0},`,
      `    is_current = ${episode.itemId === normalizedSelector.currentItemId ? 'true' : 'false'},`,
      '  },',
    ].join('\n');
  });

  return `{\n${rows.join('\n')}\n}`;
}

function splitPlaybackTitle(title: string): { displayTitle: string; displaySubtitle: string } {
  const parts = title
    .split(' - ')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 3 && /^S\d+\s*:?\s*E\d+/iu.test(parts[1])) {
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

function createMpvUiScript(
  title: string,
  playerSettings: LaunchPlayerSettings,
  episodeSelector?: LaunchMpvEpisodeSelector
): string {
  const { displayTitle, displaySubtitle } = splitPlaybackTitle(title);

  return String.raw`
local mp = require 'mp'
local overlay = mp.create_osd_overlay('ass-events')

local UI_WIDTH = 1920
local UI_HEIGHT = 1080
local BUTTON_SCALE = 2
local WINDOW_ICON_SCALE = 0.8
local BOTTOM_BUTTON_SCALE = 0.8
local BOTTOM_GAP_SCALE = 0.5
local CONTROL_HIDE_SECONDS = 3
local BLUE = 'FF7716'
local CACHE_BLUE = 'FFCF8F'
local TRACK_GRAY = 'CFCFCF'
local function b(...)
  return string.char(...)
end
local TEXT = {
  scale_mode = b(231, 188, 169, 230, 148, 190, 230, 168, 161, 229, 188, 143),
  subtitle_settings = b(229, 173, 151, 229, 185, 149, 232, 174, 190, 231, 189, 174),
  danmaku_settings = b(229, 188, 185, 229, 185, 149, 232, 174, 190, 231, 189, 174),
  statistics = b(231, 187, 159, 232, 174, 161, 228, 191, 161, 230, 129, 175),
  fit = b(233, 128, 130, 229, 186, 148, 229, 177, 143, 229, 185, 149),
  stretch = b(230, 139, 137, 228, 188, 184),
  crop = b(232, 163, 129, 229, 137, 170),
  no_audio = b(230, 151, 160, 233, 159, 179, 232, 189, 168),
  no_subtitles = b(230, 151, 160, 229, 173, 151, 229, 185, 149),
  subtitle_1 = b(229, 173, 151, 229, 185, 149, 32, 49),
  subtitle_2 = b(229, 173, 151, 229, 185, 149, 32, 50),
  subtitle_font = b(229, 173, 151, 229, 185, 149, 229, 173, 151, 228, 189, 147),
  subtitle_sync = b(229, 173, 151, 229, 185, 149, 229, 144, 140, 230, 173, 165),
  subtitle_size = b(229, 173, 151, 229, 185, 149, 229, 164, 167, 229, 176, 143),
  subtitle_position = b(229, 173, 151, 229, 185, 149, 228, 189, 141, 231, 189, 174),
  subtitle_outline = b(229, 173, 151, 229, 185, 149, 230, 143, 143, 232, 190, 185),
  subtitle_shadow_offset = b(229, 173, 151, 229, 185, 149, 233, 152, 180, 229, 189, 177, 229, 129, 143, 231, 167, 187),
  subtitle_scale = b(229, 173, 151, 229, 185, 149, 231, 188, 169, 230, 148, 190),
  danmaku_sync = b(229, 188, 185, 229, 185, 149, 229, 144, 140, 230, 173, 165),
  on = b(229, 188, 128),
  off = b(229, 133, 179),
  scroll_max_lines = b(230, 187, 154, 229, 138, 168, 229, 188, 185, 229, 185, 149, 230, 156, 128, 229, 164, 167, 232, 161, 140, 230, 149, 176),
  top_max_lines = b(233, 161, 182, 233, 131, 168, 229, 188, 185, 229, 185, 149, 230, 156, 128, 229, 164, 167, 232, 161, 140, 230, 149, 176),
  bottom_max_lines = b(229, 186, 149, 233, 131, 168, 229, 188, 185, 229, 185, 149, 230, 156, 128, 229, 164, 167, 232, 161, 140, 230, 149, 176),
  danmaku_scale = b(229, 188, 185, 229, 185, 149, 231, 188, 169, 230, 148, 190),
  danmaku_opacity = b(229, 188, 185, 229, 185, 149, 233, 128, 143, 230, 152, 142, 229, 186, 166),
  danmaku_scroll_speed = b(229, 188, 185, 229, 185, 149, 230, 187, 154, 229, 138, 168, 233, 128, 159, 229, 186, 166),
  toggle_notice = b(229, 188, 185, 229, 185, 149, 47, 229, 173, 151, 229, 185, 149, 229, 183, 178, 229, 136, 135, 230, 141, 162),
}
local SUBTITLE_LABELS = {
  delay_seconds = TEXT.subtitle_sync,
  font_size = TEXT.subtitle_size,
  position = TEXT.subtitle_position,
  outline = TEXT.subtitle_outline,
  shadow_offset = TEXT.subtitle_shadow_offset,
  scale = TEXT.subtitle_scale,
}
local DANMAKU_LABELS = {
  scroll_max_lines = TEXT.scroll_max_lines,
  top_max_lines = TEXT.top_max_lines,
  bottom_max_lines = TEXT.bottom_max_lines,
  scale = TEXT.danmaku_scale,
  opacity = TEXT.danmaku_opacity,
  speed = TEXT.danmaku_scroll_speed,
}
local display_title = ${toLuaLongString(escapeAssText(displayTitle))}
local display_subtitle = ${toLuaLongString(escapeAssText(displaySubtitle))}
local scale_mode = ${toLuaSingleQuotedString(playerSettings.playback.scaleMode)}
local font_family = ${toLuaSingleQuotedString(playerSettings.subtitles.fontFamily)}
local SPEED_OPTIONS = {'0.5', '0.75', '1', '1.25', '1.5', '2', '3', '4', '5'}
local episode_items = ${toLuaEpisodeItems(episodeSelector)}
local episode_selector_enabled = #episode_items > 0
local episode_panel_open = false
local episode_scroll_offset = 0
local episode_thumbnail_overlay_ids = {}
local audio_tracks = {}
local buttons = {}
local cache_speed = 0
local cache_state = nil
local duration = 0
local menu_open = nil
local muted = false
local paused = false
local playback_speed = 1
local position = 0
local selected_secondary_sid = 'no'
local selected_sid = 'auto'
local subtitle_tracks = {}
local subtitle_settings = {
  enabled = ${playerSettings.subtitles.enabled ? 'true' : 'false'},
  font_family = font_family,
  delay_seconds = ${playerSettings.subtitles.delaySeconds},
  font_size = ${playerSettings.subtitles.fontSize},
  position = ${playerSettings.subtitles.position},
  outline = ${playerSettings.subtitles.outline},
  shadow_offset = ${playerSettings.subtitles.shadowOffset},
  scale = ${playerSettings.subtitles.scale},
  secondary_enabled = ${playerSettings.subtitles.secondaryEnabled ? 'true' : 'false'},
}
local danmaku_settings = {
  enabled = ${playerSettings.danmaku.enabled ? 'true' : 'false'},
  scroll_max_lines = ${playerSettings.danmaku.scrollMaxLines},
  top_max_lines = ${playerSettings.danmaku.topMaxLines},
  bottom_max_lines = ${playerSettings.danmaku.bottomMaxLines},
  scale = ${playerSettings.danmaku.scale},
  opacity = ${playerSettings.danmaku.opacity},
  speed = ${playerSettings.danmaku.speed},
}
local volume = 100
local controls_visible_until = 0
local last_mouse_x = nil
local last_mouse_y = nil

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

local function update_ui_dimensions()
  UI_WIDTH = mp.get_property_number('osd-width', UI_WIDTH)
  UI_HEIGHT = mp.get_property_number('osd-height', UI_HEIGHT)
  overlay.res_x = UI_WIDTH
  overlay.res_y = UI_HEIGHT
end

local function mark_controls_active()
  controls_visible_until = mp.get_time() + CONTROL_HIDE_SECONDS
end

local function should_show_controls()
  return paused or menu_open ~= nil or episode_panel_open or mp.get_time() <= controls_visible_until
end

local function track_mouse_activity()
  local pos = mp.get_property_native('mouse-pos')
  if not pos then return end

  local x = pos.x or 0
  local y = pos.y or 0
  if last_mouse_x ~= x or last_mouse_y ~= y then
    last_mouse_x = x
    last_mouse_y = y
    mark_controls_active()
  end
end

local function append_box(out, x1, y1, x2, y2, color, alpha)
  out[#out + 1] = string.format(
    '{\\an7\\pos(0,0)\\bord0\\shad0\\alpha&H%02X&\\c&H%s&\\p1}m %d %d l %d %d l %d %d l %d %d{\\p0}',
    alpha, color, x1, y1, x2, y1, x2, y2, x1, y2
  )
end

local function round_coord(value)
  return math.floor(value + 0.5)
end

local function append_line(out, x1, y1, x2, y2, thickness, color, alpha)
  local dx = x2 - x1
  local dy = y2 - y1
  local length = math.sqrt(dx * dx + dy * dy)
  if length <= 0 then return end

  local radius = thickness / 2
  local nx = -dy / length * radius
  local ny = dx / length * radius
  out[#out + 1] = string.format(
    '{\\an7\\pos(0,0)\\bord0\\shad0\\alpha&H%02X&\\c&H%s&\\p1}m %d %d l %d %d l %d %d l %d %d{\\p0}',
    alpha,
    color,
    round_coord(x1 + nx),
    round_coord(y1 + ny),
    round_coord(x2 + nx),
    round_coord(y2 + ny),
    round_coord(x2 - nx),
    round_coord(y2 - ny),
    round_coord(x1 - nx),
    round_coord(y1 - ny)
  )
end

local function append_outline_box(out, x1, y1, x2, y2, thickness, color, alpha)
  append_box(out, x1, y1, x2, y1 + thickness, color, alpha)
  append_box(out, x2 - thickness, y1, x2, y2, color, alpha)
  append_box(out, x1, y2 - thickness, x2, y2, color, alpha)
  append_box(out, x1, y1, x1 + thickness, y2, color, alpha)
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

local function estimate_menu_text_width(text, size)
  text = tostring(text or '')
  local width = 0
  local index = 1
  local length = string.len(text)
  while index <= length do
    local byte = string.byte(text, index)
    if not byte then break end
    if byte < 128 then
      width = width + size * 0.55
      index = index + 1
    elseif byte < 224 then
      width = width + size
      index = index + 2
    elseif byte < 240 then
      width = width + size
      index = index + 3
    else
      width = width + size
      index = index + 4
    end
  end
  return width
end

local function draw_window_icon(out, icon, cx, cy)
  local size = 24 * WINDOW_ICON_SCALE
  local half = size / 2
  local thickness = math.max(2, round_coord(2.2 * WINDOW_ICON_SCALE))
  local color = 'FFFFFF'

  if icon == 'pin' then
    append_line(out, cx - half * 0.5, cy - half * 0.58, cx + half * 0.5, cy - half * 0.58, thickness, color, 0)
    append_line(out, cx, cy - half * 0.58, cx, cy + half * 0.08, thickness, color, 0)
    append_line(out, cx - half * 0.28, cy + half * 0.08, cx + half * 0.28, cy + half * 0.08, thickness, color, 0)
    append_line(out, cx, cy + half * 0.08, cx, cy + half * 0.68, thickness, color, 0)
  elseif icon == 'minimize' then
    append_line(out, cx - half * 0.5, cy, cx + half * 0.5, cy, thickness, color, 0)
  elseif icon == 'square' then
    append_outline_box(out, round_coord(cx - half * 0.44), round_coord(cy - half * 0.44), round_coord(cx + half * 0.44), round_coord(cy + half * 0.44), thickness, color, 0)
  elseif icon == 'close' then
    append_line(out, cx - half * 0.42, cy - half * 0.42, cx + half * 0.42, cy + half * 0.42, thickness, color, 0)
    append_line(out, cx + half * 0.42, cy - half * 0.42, cx - half * 0.42, cy + half * 0.42, thickness, color, 0)
  end
end

local function add_window_button(out, id, x, y, width, height, icon)
  buttons[#buttons + 1] = { id = id, x1 = x, y1 = y, x2 = x + width, y2 = y + height }
  draw_window_icon(out, icon, x + math.floor(width / 2), y + math.floor(height / 2))
end

local function draw_control_icon(out, icon, cx, cy)
  local size = 30 * BOTTOM_BUTTON_SCALE
  local half = size / 2
  local corner = half * 0.6
  local inset = half * 0.18
  local thickness = math.max(2, round_coord(2.4 * BOTTOM_BUTTON_SCALE))
  local color = 'FFFFFF'

  if icon == 'fullscreen' then
    append_line(out, cx - corner, cy - corner, cx - inset, cy - corner, thickness, color, 0)
    append_line(out, cx - corner, cy - corner, cx - corner, cy - inset, thickness, color, 0)
    append_line(out, cx + corner, cy - corner, cx + inset, cy - corner, thickness, color, 0)
    append_line(out, cx + corner, cy - corner, cx + corner, cy - inset, thickness, color, 0)
    append_line(out, cx - corner, cy + corner, cx - inset, cy + corner, thickness, color, 0)
    append_line(out, cx - corner, cy + corner, cx - corner, cy + inset, thickness, color, 0)
    append_line(out, cx + corner, cy + corner, cx + inset, cy + corner, thickness, color, 0)
    append_line(out, cx + corner, cy + corner, cx + corner, cy + inset, thickness, color, 0)
  elseif icon == 'episodes' then
    local episode_icon_size = size * 1.42
    local episode_half = episode_icon_size / 2
    local episode_thickness = math.max(thickness, round_coord(2.2 * BOTTOM_BUTTON_SCALE))
    append_line(out, cx - episode_half * 0.46, cy - episode_half * 0.36, cx + episode_half * 0.08, cy - episode_half * 0.36, episode_thickness, color, 0)
    append_line(out, cx - episode_half * 0.46, cy, cx + episode_half * 0.08, cy, episode_thickness, color, 0)
    append_line(out, cx - episode_half * 0.46, cy + episode_half * 0.36, cx + episode_half * 0.08, cy + episode_half * 0.36, episode_thickness, color, 0)
    out[#out + 1] = string.format(
      '{\\an7\\pos(0,0)\\bord0\\shad0\\alpha&H00&\\c&H%s&\\p1}m %d %d l %d %d l %d %d{\\p0}',
      color,
      round_coord(cx + episode_half * 0.26),
      round_coord(cy - episode_half * 0.28),
      round_coord(cx + episode_half * 0.58),
      round_coord(cy),
      round_coord(cx + episode_half * 0.26),
      round_coord(cy + episode_half * 0.28)
    )
  end
end

local function add_icon_button(out, id, x, y, width, height, icon)
  buttons[#buttons + 1] = { id = id, x1 = x, y1 = y, x2 = x + width, y2 = y + height }
  draw_control_icon(out, icon, x + math.floor(width / 2), y + math.floor(height / 2))
end

local function add_range_button(id, x1, y1, x2, y2)
  buttons[#buttons + 1] = { id = id, x1 = x1, y1 = y1, x2 = x2, y2 = y2 }
end

local function get_bottom_button_size()
  return round_coord(36 * BUTTON_SCALE * BOTTOM_BUTTON_SCALE)
end

local function get_bottom_layout(width)
  local icon_width = get_bottom_button_size()
  local speed_width = round_coord(96 * BOTTOM_BUTTON_SCALE)
  local left_gap = round_coord(8 * BOTTOM_GAP_SCALE)
  local left_section_gap = round_coord(30 * BOTTOM_GAP_SCALE)
  local volume_gap = round_coord(16 * BOTTOM_GAP_SCALE)
  local right_speed_gap = round_coord(26 * BOTTOM_GAP_SCALE)
  local right_gap = round_coord(10 * BOTTOM_GAP_SCALE)
  local right_fullscreen_gap = round_coord(92 * BOTTOM_GAP_SCALE)
  local episode_button_width = episode_selector_enabled and icon_width or 0
  local episode_button_gap = episode_selector_enabled and right_gap or 0
  local volume_width = 152
  local prev_x = 24
  local play_x = prev_x + icon_width + left_gap
  local next_x = play_x + icon_width + left_gap
  local mute_x = next_x + icon_width + left_section_gap
  local volume_x = mute_x + icon_width + volume_gap
  local right_group_width =
    speed_width +
    right_speed_gap +
    icon_width * 5 +
    right_gap * 3 +
    episode_button_width +
    episode_button_gap +
    right_fullscreen_gap
  local speed_x = width - 36 - right_group_width
  local audio_x = speed_x + speed_width + right_speed_gap
  local sub_x = audio_x + icon_width + right_gap
  local danmaku_x = sub_x + icon_width + right_gap
  local settings_x = danmaku_x + icon_width + right_gap
  local episodes_x = settings_x + icon_width + right_gap
  local fullscreen_x = settings_x + icon_width + right_fullscreen_gap
  if episode_selector_enabled then
    fullscreen_x = episodes_x + icon_width + right_fullscreen_gap
  end

  return {
    audio_x = audio_x,
    danmaku_x = danmaku_x,
    episodes_x = episodes_x,
    fullscreen_x = fullscreen_x,
    icon_width = icon_width,
    mute_x = mute_x,
    next_x = next_x,
    play_x = play_x,
    prev_x = prev_x,
    settings_x = settings_x,
    speed_width = speed_width,
    speed_x = speed_x,
    sub_x = sub_x,
    volume_x = volume_x,
    volume_width = volume_width,
  }
end

local function emit_settings_patch(patch)
  mp.commandv('script-message', 'taluxa-settings-patch', patch)
end

local function apply_scale_mode(mode, should_persist)
  scale_mode = mode
  mp.commandv('set', 'video-zoom', '0')
  mp.commandv('set', 'video-scale-x', '1')
  mp.commandv('set', 'video-scale-y', '1')
  if mode == 'stretch' then
    mp.commandv('set', 'keepaspect', 'no')
    mp.commandv('set', 'panscan', '0')
  elseif mode == 'crop' then
    mp.commandv('set', 'keepaspect', 'yes')
    mp.commandv('set', 'panscan', '1')
  else
    mp.commandv('set', 'keepaspect', 'yes')
    mp.commandv('set', 'panscan', '0')
  end
  if should_persist then
    emit_settings_patch(string.format('{"playback":{"scaleMode":"%s"}}', mode))
  end
end

local function apply_subtitle_settings(should_persist)
  mp.commandv('set', 'sub-visibility', subtitle_settings.enabled and 'yes' or 'no')
  mp.commandv('set', 'secondary-sub-visibility', subtitle_settings.secondary_enabled and 'yes' or 'no')
  mp.commandv('set', 'sub-font', subtitle_settings.font_family)
  mp.commandv('set', 'sub-delay', tostring(subtitle_settings.delay_seconds))
  mp.commandv('set', 'secondary-sub-delay', tostring(subtitle_settings.delay_seconds))
  mp.commandv('set', 'sub-font-size', tostring(subtitle_settings.font_size))
  mp.commandv('set', 'sub-pos', tostring(subtitle_settings.position))
  mp.commandv('set', 'secondary-sub-pos', '10')
  mp.commandv('set', 'sub-border-size', tostring(subtitle_settings.outline))
  mp.commandv('set', 'sub-shadow-offset', tostring(subtitle_settings.shadow_offset))
  mp.commandv('set', 'sub-scale', tostring(subtitle_settings.scale))
  if should_persist then
    emit_settings_patch(string.format(
      '{"subtitles":{"enabled":%s,"fontFamily":"%s","delaySeconds":%.2f,"fontSize":%d,"position":%d,"outline":%d,"shadowOffset":%d,"scale":%.2f,"secondaryEnabled":%s}}',
      subtitle_settings.enabled and 'true' or 'false',
      subtitle_settings.font_family:gsub('\\', '\\\\'):gsub('"', '\\"'),
      subtitle_settings.delay_seconds,
      subtitle_settings.font_size,
      subtitle_settings.position,
      subtitle_settings.outline,
      subtitle_settings.shadow_offset,
      subtitle_settings.scale,
      subtitle_settings.secondary_enabled and 'true' or 'false'
    ))
  end
end

local function adjust_subtitle_setting(field, delta)
  if field == 'delay_seconds' then
    subtitle_settings.delay_seconds = clamp(subtitle_settings.delay_seconds + delta, -30, 30)
  elseif field == 'font_size' then
    subtitle_settings.font_size = math.floor(clamp(subtitle_settings.font_size + delta, 12, 120) + 0.5)
  elseif field == 'position' then
    subtitle_settings.position = math.floor(clamp(subtitle_settings.position + delta, 0, 150) + 0.5)
  elseif field == 'outline' then
    subtitle_settings.outline = math.floor(clamp(subtitle_settings.outline + delta, 0, 12) + 0.5)
  elseif field == 'shadow_offset' then
    subtitle_settings.shadow_offset = math.floor(clamp(subtitle_settings.shadow_offset + delta, 0, 12) + 0.5)
  elseif field == 'scale' then
    subtitle_settings.scale = clamp(subtitle_settings.scale + delta, 0.5, 2)
  end
  apply_subtitle_settings(true)
end

local function emit_danmaku_settings_patch()
  emit_settings_patch(string.format(
    '{"danmaku":{"enabled":%s,"scrollMaxLines":%d,"topMaxLines":%d,"bottomMaxLines":%d,"scale":%.2f,"opacity":%.2f,"speed":%.2f}}',
    danmaku_settings.enabled and 'true' or 'false',
    danmaku_settings.scroll_max_lines,
    danmaku_settings.top_max_lines,
    danmaku_settings.bottom_max_lines,
    danmaku_settings.scale,
    danmaku_settings.opacity,
    danmaku_settings.speed
  ))
end

local function adjust_danmaku_setting(field, delta)
  if field == 'scroll_max_lines' then
    danmaku_settings.scroll_max_lines = math.floor(clamp(danmaku_settings.scroll_max_lines + delta, 1, 12) + 0.5)
  elseif field == 'top_max_lines' then
    danmaku_settings.top_max_lines = math.floor(clamp(danmaku_settings.top_max_lines + delta, 1, 12) + 0.5)
  elseif field == 'bottom_max_lines' then
    danmaku_settings.bottom_max_lines = math.floor(clamp(danmaku_settings.bottom_max_lines + delta, 1, 12) + 0.5)
  elseif field == 'scale' then
    danmaku_settings.scale = clamp(danmaku_settings.scale + delta, 0.5, 2)
  elseif field == 'opacity' then
    danmaku_settings.opacity = clamp(danmaku_settings.opacity + delta, 0, 1)
  elseif field == 'speed' then
    danmaku_settings.speed = clamp(danmaku_settings.speed + delta, 0.5, 2)
  end
  emit_danmaku_settings_patch()
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
    audio_tracks[1] = { id = 'no', label = TEXT.no_audio }
  end
end

local function update_subtitle_tracks(value)
  subtitle_tracks = {}
  for _, track in ipairs(value or {}) do
    if track.type == 'sub' then
      local label = track.title or track.lang or ('Subtitle ' .. tostring(track.id))
      subtitle_tracks[#subtitle_tracks + 1] = { id = track.id, label = label }
    end
  end
  if #subtitle_tracks == 0 then
    subtitle_tracks[1] = { id = 'no', label = TEXT.no_subtitles }
  end
end

local function delta_label(base_label, option)
  if option.value and tonumber(option.value.delta or 0) > 0 then
    return base_label .. ' +'
  end
  return base_label .. ' -'
end

local function localize_options(options, menu_name)
  if menu_name == 'audio' then
    for _, option in ipairs(options) do
      if option.value == 'no' then
        option.label = TEXT.no_audio
      end
    end
  elseif menu_name == 'settings' then
    options[1].label = TEXT.scale_mode
    options[2].label = TEXT.subtitle_settings
    options[3].label = TEXT.danmaku_settings
    options[4].label = TEXT.statistics
  elseif menu_name == 'scale' then
    for _, option in ipairs(options) do
      if option.value == 'fit' then
        option.label = TEXT.fit
      elseif option.value == 'stretch' then
        option.label = TEXT.stretch
      elseif option.value == 'crop' then
        option.label = TEXT.crop
      end
    end
  elseif menu_name == 'subtitles' then
    local tab_index = 0
    for _, option in ipairs(options) do
      if option.value == 'no' then
        option.label = TEXT.no_subtitles
      elseif option.id == 'subtitle-tab' then
        tab_index = tab_index + 1
        option.label = tab_index == 1 and TEXT.subtitle_1 or TEXT.subtitle_2
      elseif option.id == 'disabled' and option.suffix == subtitle_settings.font_family then
        option.label = TEXT.subtitle_font
      elseif option.id == 'disabled' then
        option.label = TEXT.subtitle_settings
      elseif option.id == 'subtitle-value-minus' or option.id == 'subtitle-value-plus' then
        local base_label = SUBTITLE_LABELS[option.value and option.value.field]
        if base_label then
          option.label = delta_label(base_label, option)
        end
      end
    end
  elseif menu_name == 'danmaku' then
    if options[1] then options[1].label = TEXT.danmaku_settings end
    if options[2] then
      options[2].label = TEXT.danmaku_sync
      options[2].suffix = danmaku_settings.enabled and TEXT.on or TEXT.off
    end
    for _, option in ipairs(options) do
      if option.id == 'danmaku-value-minus' or option.id == 'danmaku-value-plus' then
        local base_label = DANMAKU_LABELS[option.value and option.value.field]
        if base_label then
          option.label = delta_label(base_label, option)
        end
      end
    end
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
  local item_height = round_coord(46 * 0.8)
  local menu_text_size = round_coord(24 * 0.9)
  local menu_suffix_size = round_coord(18 * 0.9)
  local menu_vertical_offset = 24
  local menu_min_width = 72
  local menu_suffix_gap = 18
  local layout = get_bottom_layout(width)
  local speed_center = layout.speed_x + math.floor(layout.speed_width / 2)
  local audio_center = layout.audio_x + math.floor(layout.icon_width / 2)
  local settings_center = layout.settings_x + math.floor(layout.icon_width / 2)
  local anchor_center = speed_center
  if menu_open == 'audio' then
    anchor_center = audio_center
  elseif menu_open == 'settings' or menu_open == 'scale' or menu_open == 'subtitles' or menu_open == 'danmaku' then
    anchor_center = settings_center
  end
  local options = {}

  if menu_open == 'speed' then
    for _, value in ipairs(SPEED_OPTIONS) do
      options[#options + 1] = { id = 'speed-option', value = value, label = value .. 'x' }
    end
  elseif menu_open == 'audio' then
    for _, track in ipairs(audio_tracks) do
      options[#options + 1] = { id = 'audio-option', value = track.id, label = track.label }
    end
  elseif menu_open == 'settings' then
    options = {
      { id = 'settings-scale', label = TEXT.scale_mode, suffix = '>' },
      { id = 'settings-subtitles', label = TEXT.subtitle_settings },
      { id = 'settings-danmaku', label = TEXT.danmaku_settings },
      { id = 'settings-stats', label = TEXT.statistics },
    }
  elseif menu_open == 'scale' then
    local scale_options = {
      { 'fit', TEXT.fit },
      { 'stretch', TEXT.stretch },
      { 'crop', TEXT.crop },
    }
    for _, option in ipairs(scale_options) do
      options[#options + 1] = { id = 'scale-option', value = option[1], label = option[2] }
    end
  elseif menu_open == 'subtitles' then
    options[#options + 1] = { id = 'disabled', label = TEXT.subtitle_settings }
    options[#options + 1] = { id = 'subtitle-tab', value = 'primary', label = TEXT.subtitle_1, suffix = tostring(selected_sid) }
    for _, track in ipairs(subtitle_tracks) do
      options[#options + 1] = { id = 'subtitle-track-option', value = track.id, label = track.label }
    end
    options[#options + 1] = { id = 'subtitle-tab', value = 'secondary', label = TEXT.subtitle_2, suffix = tostring(selected_secondary_sid) }
    for _, track in ipairs(subtitle_tracks) do
      options[#options + 1] = { id = 'secondary-subtitle-track-option', value = track.id, label = track.label }
    end
    options[#options + 1] = { id = 'disabled', label = TEXT.subtitle_font, suffix = subtitle_settings.font_family }
    options[#options + 1] = { id = 'subtitle-value-minus', value = { field = 'delay_seconds', delta = -0.1 }, label = TEXT.subtitle_sync .. ' -', suffix = string.format('%.1fs', subtitle_settings.delay_seconds) }
    options[#options + 1] = { id = 'subtitle-value-plus', value = { field = 'delay_seconds', delta = 0.1 }, label = TEXT.subtitle_sync .. ' +' }
    options[#options + 1] = { id = 'subtitle-value-minus', value = { field = 'font_size', delta = -1 }, label = TEXT.subtitle_size .. ' -', suffix = tostring(subtitle_settings.font_size) }
    options[#options + 1] = { id = 'subtitle-value-plus', value = { field = 'font_size', delta = 1 }, label = TEXT.subtitle_size .. ' +' }
    options[#options + 1] = { id = 'subtitle-value-minus', value = { field = 'position', delta = -1 }, label = TEXT.subtitle_position .. ' -', suffix = tostring(subtitle_settings.position) }
    options[#options + 1] = { id = 'subtitle-value-plus', value = { field = 'position', delta = 1 }, label = TEXT.subtitle_position .. ' +' }
    options[#options + 1] = { id = 'subtitle-value-minus', value = { field = 'outline', delta = -1 }, label = TEXT.subtitle_outline .. ' -', suffix = tostring(subtitle_settings.outline) }
    options[#options + 1] = { id = 'subtitle-value-plus', value = { field = 'outline', delta = 1 }, label = TEXT.subtitle_outline .. ' +' }
    options[#options + 1] = { id = 'subtitle-value-minus', value = { field = 'shadow_offset', delta = -1 }, label = TEXT.subtitle_shadow_offset .. ' -', suffix = tostring(subtitle_settings.shadow_offset) }
    options[#options + 1] = { id = 'subtitle-value-plus', value = { field = 'shadow_offset', delta = 1 }, label = TEXT.subtitle_shadow_offset .. ' +' }
    options[#options + 1] = { id = 'subtitle-value-minus', value = { field = 'scale', delta = -0.1 }, label = TEXT.subtitle_scale .. ' -', suffix = string.format('%.1f', subtitle_settings.scale) }
    options[#options + 1] = { id = 'subtitle-value-plus', value = { field = 'scale', delta = 0.1 }, label = TEXT.subtitle_scale .. ' +' }
  elseif menu_open == 'danmaku' then
    options[#options + 1] = { id = 'disabled', label = TEXT.danmaku_settings }
    options[#options + 1] = { id = 'disabled', label = TEXT.danmaku_sync, suffix = danmaku_settings.enabled and TEXT.on or TEXT.off }
    options[#options + 1] = { id = 'danmaku-value-minus', value = { field = 'scroll_max_lines', delta = -1 }, label = TEXT.scroll_max_lines .. ' -', suffix = tostring(danmaku_settings.scroll_max_lines) }
    options[#options + 1] = { id = 'danmaku-value-plus', value = { field = 'scroll_max_lines', delta = 1 }, label = TEXT.scroll_max_lines .. ' +' }
    options[#options + 1] = { id = 'danmaku-value-minus', value = { field = 'top_max_lines', delta = -1 }, label = TEXT.top_max_lines .. ' -', suffix = tostring(danmaku_settings.top_max_lines) }
    options[#options + 1] = { id = 'danmaku-value-plus', value = { field = 'top_max_lines', delta = 1 }, label = TEXT.top_max_lines .. ' +' }
    options[#options + 1] = { id = 'danmaku-value-minus', value = { field = 'bottom_max_lines', delta = -1 }, label = TEXT.bottom_max_lines .. ' -', suffix = tostring(danmaku_settings.bottom_max_lines) }
    options[#options + 1] = { id = 'danmaku-value-plus', value = { field = 'bottom_max_lines', delta = 1 }, label = TEXT.bottom_max_lines .. ' +' }
    options[#options + 1] = { id = 'danmaku-value-minus', value = { field = 'scale', delta = -0.1 }, label = TEXT.danmaku_scale .. ' -', suffix = string.format('%.1f', danmaku_settings.scale) }
    options[#options + 1] = { id = 'danmaku-value-plus', value = { field = 'scale', delta = 0.1 }, label = TEXT.danmaku_scale .. ' +' }
    options[#options + 1] = { id = 'danmaku-value-minus', value = { field = 'opacity', delta = -0.05 }, label = TEXT.danmaku_opacity .. ' -', suffix = string.format('%d%%', math.floor(danmaku_settings.opacity * 100 + 0.5)) }
    options[#options + 1] = { id = 'danmaku-value-plus', value = { field = 'opacity', delta = 0.05 }, label = TEXT.danmaku_opacity .. ' +' }
    options[#options + 1] = { id = 'danmaku-value-minus', value = { field = 'speed', delta = -0.1 }, label = TEXT.danmaku_scroll_speed .. ' -', suffix = string.format('%.1fx', danmaku_settings.speed) }
    options[#options + 1] = { id = 'danmaku-value-plus', value = { field = 'speed', delta = 0.1 }, label = TEXT.danmaku_scroll_speed .. ' +' }
  end

  localize_options(options, menu_open)

  local max_text_width = 0
  for _, option in ipairs(options) do
    local label_width = estimate_menu_text_width(option.label, menu_text_size)
    local suffix_width = option.suffix and estimate_menu_text_width(option.suffix, menu_suffix_size) or 0
    local content_width = label_width + suffix_width + (option.suffix and menu_suffix_gap or 0)
    max_text_width = math.max(max_text_width, content_width)
  end
  local menu_width = math.max(menu_min_width, round_coord(max_text_width * 1.2))
  local menu_height = math.max(item_height, #options * item_height)
  local x = math.min(width - menu_width - 28, math.max(28, anchor_center - math.floor(menu_width / 2)))
  local y = height - 128 - menu_height + menu_vertical_offset
  append_box(out, x, y, x + menu_width, y + menu_height, '101010', 128)

  for index, option in ipairs(options) do
    local item_y = y + (index - 1) * item_height
    local label = option.label
    add_button(out, option.id, x, item_y, menu_width, item_height, label, menu_text_size, option.value)
    if option.suffix then
      append_text(out, x + menu_width - 14, item_y + math.floor(item_height / 2) + 1, 6, menu_suffix_size, option.suffix, 'CFCFCF', 0, false)
    end
  end
end

local function clear_episode_thumbnail_overlays()
  for overlay_id, _ in pairs(episode_thumbnail_overlay_ids) do
    mp.commandv('overlay-remove', tostring(overlay_id))
  end
  episode_thumbnail_overlay_ids = {}
end

local function remove_episode_thumbnail_overlay(overlay_id)
  if episode_thumbnail_overlay_ids[overlay_id] then
    mp.commandv('overlay-remove', tostring(overlay_id))
    episode_thumbnail_overlay_ids[overlay_id] = nil
  end
end

local function add_episode_thumbnail_overlay(overlay_id, x, y, episode)
  if not episode.thumbnail_path or episode.thumbnail_path == '' then
    remove_episode_thumbnail_overlay(overlay_id)
    return false
  end
  if not episode.thumbnail_width or episode.thumbnail_width <= 0 then
    remove_episode_thumbnail_overlay(overlay_id)
    return false
  end
  if not episode.thumbnail_height or episode.thumbnail_height <= 0 then
    remove_episode_thumbnail_overlay(overlay_id)
    return false
  end
  if not episode.thumbnail_stride or episode.thumbnail_stride <= 0 then
    remove_episode_thumbnail_overlay(overlay_id)
    return false
  end
  local overlay_key = table.concat({
    tostring(x),
    tostring(y),
    episode.thumbnail_path,
    tostring(episode.thumbnail_width),
    tostring(episode.thumbnail_height),
    tostring(episode.thumbnail_stride)
  }, '|')
  if episode_thumbnail_overlay_ids[overlay_id] == overlay_key then
    return true
  end
  remove_episode_thumbnail_overlay(overlay_id)
  mp.commandv(
    'overlay-add',
    tostring(overlay_id),
    tostring(x),
    tostring(y),
    episode.thumbnail_path,
    '0',
    'bgra',
    tostring(episode.thumbnail_width),
    tostring(episode.thumbnail_height),
    tostring(episode.thumbnail_stride)
  )
  episode_thumbnail_overlay_ids[overlay_id] = overlay_key
  return true
end

local function sync_episode_thumbnail_overlays(active_overlay_ids)
  local stale_overlay_ids = {}
  for overlay_id, _ in pairs(episode_thumbnail_overlay_ids) do
    if not active_overlay_ids[overlay_id] then
      stale_overlay_ids[#stale_overlay_ids + 1] = overlay_id
    end
  end
  for _, overlay_id in ipairs(stale_overlay_ids) do
    remove_episode_thumbnail_overlay(overlay_id)
  end
end

local function get_episode_visible_capacity()
  local start_y = 42
  local item_height = 88
  return math.max(1, math.floor((UI_HEIGHT - start_y - 14) / item_height))
end

local function clamp_episode_scroll()
  local max_scroll = math.max(0, #episode_items - get_episode_visible_capacity())
  episode_scroll_offset = math.floor(clamp(episode_scroll_offset, 0, max_scroll))
end

local function draw_episode_panel(out)
  if not episode_panel_open or not episode_selector_enabled then
    clear_episode_thumbnail_overlays()
    return
  end

  clamp_episode_scroll()

  local width = UI_WIDTH
  local height = UI_HEIGHT
  local panel_width = 398
  local panel_x = width - panel_width
  local panel_y = 0
  local item_height = 88
  local thumb_width = 128
  local thumb_height = 72
  local item_gap = 10
  local content_x = panel_x + 10
  local start_y = panel_y + 42
  append_box(out, panel_x, panel_y, width, height, '050505', 70)
  add_button(out, 'episode-panel-close', panel_x + 8, panel_y + 8, 36, 28, '×', 22)

  local active_overlay_ids = {}
  local visible_slot = 0
  for index = episode_scroll_offset + 1, #episode_items do
    local episode = episode_items[index]
    visible_slot = visible_slot + 1
    local item_y = start_y + (visible_slot - 1) * item_height
    if item_y < height - 14 and item_y + thumb_height > panel_y then
      add_button(out, 'episode-option', panel_x, item_y, panel_width, item_height, '', 1, episode.item_id)
      if episode.is_current then
        append_outline_box(out, panel_x + 6, item_y - 4, width - 12, item_y + thumb_height + 4, 2, BLUE, 0)
      end
      if not episode.thumbnail_path or episode.thumbnail_path == '' then
        append_box(out, content_x, item_y, content_x + thumb_width, item_y + thumb_height, '2A2A2A', 30)
      end
      append_outline_box(out, content_x, item_y, content_x + thumb_width, item_y + thumb_height, 1, '3A3A3A', 80)
      local thumbnail_overlay_id = 40 + visible_slot
      if add_episode_thumbnail_overlay(thumbnail_overlay_id, content_x, item_y, episode) then
        active_overlay_ids[thumbnail_overlay_id] = true
      end
      local text_x = content_x + thumb_width + item_gap
      local title_color = episode.is_current and 'B08DFF' or 'FFFFFF'
      append_text(out, text_x, item_y + 22, 4, 18, episode.title, title_color, 0, true)
      if episode.duration and episode.duration ~= '' then
        append_text(out, text_x, item_y + 46, 4, 15, episode.duration, 'FFFFFF', 0, false)
      end
    else
      break
    end
  end
  sync_episode_thumbnail_overlays(active_overlay_ids)
end

local function set_active_episode(item_id, next_title, next_display_title, next_display_subtitle)
  if not item_id or item_id == '' then return end
  for _, episode in ipairs(episode_items) do
    episode.is_current = episode.item_id == item_id
  end
  if next_display_title and next_display_title ~= '' then
    display_title = next_display_title
    display_subtitle = next_display_subtitle or ''
  elseif next_title and next_title ~= '' then
    display_title = next_title
    display_subtitle = ''
  end
end

local function request_episode_switch(item_id)
  if not item_id or item_id == '' then return end
  for _, episode in ipairs(episode_items) do
    if episode.item_id == item_id then
      if not episode.is_current then
        mp.commandv('script-message', 'taluxa-select-episode', item_id)
      end
      return
    end
  end
end

local function scroll_episode_panel(delta)
  if not episode_panel_open then return end
  local max_scroll = math.max(0, #episode_items - get_episode_visible_capacity())
  local step = delta > 0 and -3 or 3
  episode_scroll_offset = math.floor(clamp(episode_scroll_offset + step, 0, max_scroll))
end

local function append_cache_ranges(out, bar_left, bar_right, bar_y)
  if not cache_state or duration <= 0 then return end

  local ranges = cache_state['seekable-ranges'] or {}
  local bar_width = math.max(1, bar_right - bar_left)
  for _, cached_range in ipairs(ranges) do
    local start_time = tonumber(cached_range['start']) or 0
    local end_time = tonumber(cached_range['end']) or 0
    if end_time > position then
      local x1 = bar_left + math.floor(bar_width * clamp(math.max(start_time, position) / duration, 0, 1))
      local x2 = bar_left + math.floor(bar_width * clamp(end_time / duration, 0, 1))
      if x2 > x1 then
        append_box(out, x1, bar_y - 2, x2, bar_y + 2, CACHE_BLUE, 35)
      end
    end
  end
end

local function draw_controls()
  update_ui_dimensions()
  track_mouse_activity()

  local width = UI_WIDTH
  local height = UI_HEIGHT
  local out = {}
  buttons = {}
  if not should_show_controls() then
    overlay.data = ''
    overlay:update()
    return
  end

  local progress = 0
  if duration > 0 then
    progress = clamp(position / duration, 0, 1)
  end
  local remaining = math.max(0, duration - position)
  local bar_y = height - 78
  local title_y = height - 126
  local subtitle_y = height - 98
  local controls_y = height - 42
  local bar_left = 74
  local bar_right = width - 90
  local bar_width = math.max(1, bar_right - bar_left)
  local progress_x = bar_left + math.floor(bar_width * progress)

  append_text(out, 24, title_y, 1, 30, display_title, 'FFFFFF', 0, true)
  if display_subtitle ~= '' then
    append_text(out, 24, subtitle_y, 1, 18, display_subtitle, 'E6E6E6', 0, false)
  end

  append_text(out, 24, bar_y + 5, 4, 16, format_clock(position), 'FFFFFF', 0, false)
  append_text(out, width - 24, bar_y + 5, 6, 16, format_clock(remaining), 'FFFFFF', 0, false)
  append_box(out, bar_left, bar_y - 1, bar_right, bar_y + 1, TRACK_GRAY, 80)
  append_cache_ranges(out, bar_left, bar_right, bar_y)
  append_box(out, bar_left, bar_y - 2, progress_x, bar_y + 2, BLUE, 0)
  append_box(out, progress_x - 7, bar_y - 7, progress_x + 7, bar_y + 7, BLUE, 0)
  add_range_button('seek', bar_left, bar_y - 12, bar_right, bar_y + 12)

  local layout = get_bottom_layout(width)
  local bottom_button_height = get_bottom_button_size()
  local bottom_icon_button = get_bottom_button_size()
  local button_y = controls_y - math.floor(bottom_button_height / 2)
  local volume_end_x = layout.volume_x + layout.volume_width
  local volume_value_x = layout.volume_x + math.floor(layout.volume_width * clamp(volume / 100, 0, 1))
  add_button(out, 'prev', layout.prev_x, button_y, bottom_icon_button, bottom_button_height, '|<', 34)
  add_button(out, 'play', layout.play_x, button_y, bottom_icon_button, bottom_button_height, paused and '\226\150\182' or 'II', 34)
  add_button(out, 'next', layout.next_x, button_y, bottom_icon_button, bottom_button_height, '>|', 34)
  add_button(out, 'mute', layout.mute_x, button_y, bottom_icon_button, bottom_button_height, muted and 'x' or '\226\153\170', 34)
  append_box(out, layout.volume_x, controls_y - 3, volume_end_x, controls_y + 3, TRACK_GRAY, 115)
  append_box(out, layout.volume_x, controls_y - 4, volume_value_x, controls_y + 4, BLUE, 0)
  append_box(out, volume_value_x - 7, controls_y - 7, volume_value_x + 7, controls_y + 7, BLUE, 0)
  add_range_button('volume', layout.volume_x - 14, controls_y - 18, volume_end_x + 14, controls_y + 18)

  add_button(out, 'speed', layout.speed_x, button_y, layout.speed_width, bottom_button_height, string.format('%.1fx', playback_speed), 22)
  add_button(out, 'audio', layout.audio_x, button_y, bottom_icon_button, bottom_button_height, '\226\153\170', 34)
  add_button(out, 'sub', layout.sub_x, button_y, bottom_icon_button, bottom_button_height, 'CC', 22)
  add_button(out, 'danmaku', layout.danmaku_x, button_y, bottom_icon_button, bottom_button_height, 'DM', 22)
  add_button(out, 'settings', layout.settings_x, button_y, bottom_icon_button, bottom_button_height, '\226\154\153', 32)
  if episode_selector_enabled then
    add_icon_button(out, 'episodes', layout.episodes_x, button_y, bottom_icon_button, bottom_button_height, 'episodes')
  end
  add_icon_button(out, 'fullscreen', layout.fullscreen_x, button_y, bottom_icon_button, bottom_button_height, 'fullscreen')

  draw_options_menu(out)
  draw_episode_panel(out)

  append_text(out, width - 20, 68, 3, 14, format_speed(cache_speed), 'FFFFFF', 0, false)
  local window_button_width = 44
  local window_button_height = 38
  local window_button_gap = 18
  local window_x = width - 20 - window_button_width * 4 - window_button_gap * 3
  add_window_button(out, 'pin', window_x, 8, window_button_width, window_button_height, 'pin')
  window_x = window_x + window_button_width + window_button_gap
  add_window_button(out, 'minimize', window_x, 8, window_button_width, window_button_height, 'minimize')
  window_x = window_x + window_button_width + window_button_gap
  add_window_button(out, 'maximize', window_x, 8, window_button_width, window_button_height, 'square')
  window_x = window_x + window_button_width + window_button_gap
  add_window_button(out, 'close', window_x, 8, window_button_width, window_button_height, 'close')

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

local function is_center_play_pause_area(x, y)
  local left = UI_WIDTH * 0.2
  local right = UI_WIDTH * 0.8
  local top = UI_HEIGHT * 0.18
  local bottom = UI_HEIGHT * 0.78
  return x >= left and x <= right and y >= top and y <= bottom
end

local function handle_click()
  mark_controls_active()
  local pos = normalize_mouse_pos(mp.get_property_native('mouse-pos'))
  if not pos then
    draw_controls()
    return
  end
  local id, button = button_at(pos.x or 0, pos.y or 0)
  if not id then
    if menu_open or episode_panel_open then
      menu_open = nil
      episode_panel_open = false
      draw_controls()
    elseif is_center_play_pause_area(pos.x or 0, pos.y or 0) then
      mp.commandv('cycle', 'pause')
      draw_controls()
    else
      draw_controls()
    end
    return
  end

  if id == 'seek' and duration > 0 then
    menu_open = nil
    episode_panel_open = false
    local ratio = clamp(((pos.x or button.x1) - button.x1) / math.max(1, button.x2 - button.x1), 0, 1)
    mp.commandv('set', 'time-pos', duration * ratio)
  elseif id == 'volume' then
    menu_open = nil
    episode_panel_open = false
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
  elseif id == 'episode-option' then
    menu_open = nil
    episode_panel_open = false
    request_episode_switch(tostring(button.value))
  elseif id == 'episode-panel-close' then
    episode_panel_open = false
  elseif id == 'settings-scale' then
    menu_open = 'scale'
  elseif id == 'scale-option' then
    apply_scale_mode(tostring(button.value), true)
    menu_open = 'settings'
  elseif id == 'settings-subtitles' then
    menu_open = 'subtitles'
  elseif id == 'settings-danmaku' then
    menu_open = 'danmaku'
  elseif id == 'settings-stats' then
    menu_open = nil
    mp.commandv('script-binding', 'stats/display-stats-toggle')
  elseif id == 'subtitle-track-option' then
    selected_sid = tostring(button.value)
    mp.commandv('set', 'sid', selected_sid)
  elseif id == 'secondary-subtitle-track-option' then
    selected_secondary_sid = tostring(button.value)
    mp.commandv('set', 'secondary-sid', selected_secondary_sid)
    subtitle_settings.secondary_enabled = selected_secondary_sid ~= 'no'
    apply_subtitle_settings(true)
  elseif id == 'subtitle-value-minus' or id == 'subtitle-value-plus' then
    if button.value then
      adjust_subtitle_setting(button.value.field, button.value.delta)
    end
  elseif id == 'danmaku-value-minus' or id == 'danmaku-value-plus' then
    if button.value then
      adjust_danmaku_setting(button.value.field, button.value.delta)
    end
  elseif id == 'prev' then
    menu_open = nil
    episode_panel_open = false
    mp.commandv('playlist-prev')
  elseif id == 'play' then
    menu_open = nil
    episode_panel_open = false
    mp.commandv('cycle', 'pause')
  elseif id == 'next' then
    menu_open = nil
    episode_panel_open = false
    mp.commandv('playlist-next')
  elseif id == 'mute' then
    menu_open = nil
    episode_panel_open = false
    mp.commandv('cycle', 'mute')
  elseif id == 'speed' then
    episode_panel_open = false
    if menu_open == 'speed' then
      menu_open = nil
    else
      menu_open = 'speed'
    end
  elseif id == 'audio' then
    episode_panel_open = false
    if menu_open == 'audio' then
      menu_open = nil
    else
      menu_open = 'audio'
    end
  elseif id == 'sub' then
    menu_open = nil
    episode_panel_open = false
    mp.commandv('cycle', 'sid')
  elseif id == 'danmaku' then
    menu_open = nil
    episode_panel_open = false
    mp.commandv('cycle', 'secondary-sid')
    mp.commandv('show-text', TEXT.toggle_notice, '1200')
  elseif id == 'settings' then
    episode_panel_open = false
    if menu_open == 'settings' then
      menu_open = nil
    else
      menu_open = 'settings'
    end
  elseif id == 'episodes' then
    menu_open = nil
    episode_panel_open = not episode_panel_open
  elseif id == 'fullscreen' then
    menu_open = nil
    episode_panel_open = false
    mp.commandv('cycle', 'fullscreen')
  elseif id == 'minimize' then
    menu_open = nil
    episode_panel_open = false
    mp.commandv('set', 'window-minimized', 'yes')
  elseif id == 'maximize' then
    menu_open = nil
    episode_panel_open = false
    local is_maximized = mp.get_property_bool('window-maximized') and 'yes' or 'no'
    mp.commandv('script-message', 'taluxa-toggle-window-maximize', is_maximized)
  elseif id == 'close' then
    mp.commandv('quit')
  end
  draw_controls()
end

local function handle_wheel(delta)
  mark_controls_active()
  if episode_panel_open then
    scroll_episode_panel(delta)
    draw_controls()
    return
  end
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
mp.observe_property('demuxer-cache-state', 'native', function(_, value) cache_state = value; draw_controls() end)
mp.observe_property('duration', 'number', function(_, value) duration = value or 0; draw_controls() end)
mp.observe_property('time-pos', 'number', function(_, value) position = value or 0; draw_controls() end)
mp.observe_property('pause', 'bool', function(_, value) paused = value or false; draw_controls() end)
mp.observe_property('speed', 'number', function(_, value) playback_speed = value or 1; draw_controls() end)
mp.observe_property('volume', 'number', function(_, value) volume = value or 0; draw_controls() end)
mp.observe_property('mute', 'bool', function(_, value) muted = value or false; draw_controls() end)
mp.observe_property('track-list', 'native', function(_, value) update_audio_tracks(value); update_subtitle_tracks(value); draw_controls() end)
mp.observe_property('osd-width', 'native', draw_controls)
mp.observe_property('osd-height', 'native', draw_controls)
mp.add_forced_key_binding('MBTN_LEFT', 'taluxa-click', handle_click)
mp.add_forced_key_binding('WHEEL_UP', 'taluxa-wheel-up', function() handle_wheel(1) end)
mp.add_forced_key_binding('WHEEL_DOWN', 'taluxa-wheel-down', function() handle_wheel(-1) end)
mp.add_periodic_timer(1, draw_controls)
mp.register_script_message('taluxa-active-episode', function(item_id, next_title, next_display_title, next_display_subtitle)
  set_active_episode(tostring(item_id or ''), tostring(next_title or ''), tostring(next_display_title or ''), tostring(next_display_subtitle or ''))
  position = 0
  duration = 0
  draw_controls()
end)
apply_scale_mode(scale_mode, false)
apply_subtitle_settings(false)
update_audio_tracks(mp.get_property_native('track-list'))
update_subtitle_tracks(mp.get_property_native('track-list'))
mark_controls_active()
draw_controls()
`.trimStart();
}

export interface MpvControllerOptions {
  connectIpc?: ConnectIpc;
  connectRetryDelayMs?: number;
  connectTimeoutMs?: number;
  createInputConfigFilePath?: (sessionId: number) => string;
  createDanmakuFilePath?: (sessionId: number) => string;
  createUiScriptFilePath?: (sessionId: number) => string;
  createLogFilePath?: (sessionId: number) => string;
  createIpcEndpoint?: () => string;
  fileExists?: (targetPath: string) => boolean;
  fetchDanmaku?: FetchDanmaku;
  getWindowMaximizeBounds?: () => MpvWindowBounds | null;
  isPackaged?: boolean;
  maxConnectAttempts?: number;
  moduleDir?: string;
  onEpisodeSelect?: (itemId: string) => void;
  onPlayerSettingsPatch?: (patch: PlayerSettingsPatch) => void | Promise<void>;
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

function getHttpHeaderFields(httpHeaders: Record<string, string> | undefined): string[] {
  return Object.entries(httpHeaders ?? {})
    .filter(
    ([name, value]) => name.trim() && value.trim()
    )
    .map(([name, value]) => `${name.trim()}: ${value.trim()}`);
}

function getHttpHeaderArgs(httpHeaders: Record<string, string> | undefined): string[] {
  const headerFields = getHttpHeaderFields(httpHeaders);

  if (headerFields.length === 0) {
    return [];
  }

  return [
    `--http-header-fields=${headerFields.join(',')}`,
    `--demuxer-lavf-o=headers=${headerFields.join('\r\n')}\r\n`,
  ];
}

function getPlaybackProxyValue(streamUrl: string, proxy: ProxySettings): string | null {
  if (isLocalHttpUrl(streamUrl) || proxy.mode === 'direct') {
    return '';
  }

  if (isCustomProxyConfigured(proxy)) {
    return proxy.customProxyUrl.trim();
  }

  return null;
}

function createLoadFileOptions(input: LaunchMpvInput): Record<string, string> {
  return {
    start: String(normalizeStartSeconds(input.startSeconds)),
    'force-media-title': input.title,
  };
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

function clampNumber(value: number, minValue: number, maxValue: number): number {
  if (!Number.isFinite(value)) {
    return minValue;
  }

  return Math.max(minValue, Math.min(maxValue, value));
}

function normalizeWindowBounds(bounds: MpvWindowBounds | null): MpvWindowBounds | null {
  if (!bounds) {
    return null;
  }

  const x = Math.round(bounds.x);
  const y = Math.round(bounds.y);
  const width = Math.round(bounds.width);
  const height = Math.round(bounds.height);

  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return null;
  }

  return { x, y, width, height };
}

function formatGeometryOffset(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function formatWindowGeometry(bounds: MpvWindowBounds): string {
  return `${bounds.width}x${bounds.height}${formatGeometryOffset(bounds.x)}${formatGeometryOffset(bounds.y)}`;
}

function isMpvWindowMaximized(value: unknown): boolean {
  return value === true || value === 'yes' || value === 'true' || value === 1;
}

function parsePlayerSettingsPatch(value: unknown): PlayerSettingsPatch | null {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as PlayerSettingsPatch;
    const patch: PlayerSettingsPatch = {};

    if (
      parsed.playback?.scaleMode === 'fit' ||
      parsed.playback?.scaleMode === 'stretch' ||
      parsed.playback?.scaleMode === 'crop'
    ) {
      patch.playback = { scaleMode: parsed.playback.scaleMode };
    }

    if (parsed.subtitles) {
      patch.subtitles = {};
      if (typeof parsed.subtitles.enabled === 'boolean') {
        patch.subtitles.enabled = parsed.subtitles.enabled;
      }
      if (typeof parsed.subtitles.secondaryEnabled === 'boolean') {
        patch.subtitles.secondaryEnabled = parsed.subtitles.secondaryEnabled;
      }
      if (typeof parsed.subtitles.fontFamily === 'string') {
        patch.subtitles.fontFamily = parsed.subtitles.fontFamily.slice(0, 80);
      }
      if (typeof parsed.subtitles.delaySeconds === 'number') {
        patch.subtitles.delaySeconds = clampNumber(parsed.subtitles.delaySeconds, -30, 30);
      }
      if (typeof parsed.subtitles.fontSize === 'number') {
        patch.subtitles.fontSize = Math.round(clampNumber(parsed.subtitles.fontSize, 12, 120));
      }
      if (typeof parsed.subtitles.position === 'number') {
        patch.subtitles.position = Math.round(clampNumber(parsed.subtitles.position, 0, 150));
      }
      if (typeof parsed.subtitles.outline === 'number') {
        patch.subtitles.outline = Math.round(clampNumber(parsed.subtitles.outline, 0, 12));
      }
      if (typeof parsed.subtitles.shadowOffset === 'number') {
        patch.subtitles.shadowOffset = Math.round(
          clampNumber(parsed.subtitles.shadowOffset, 0, 12)
        );
      }
      if (typeof parsed.subtitles.scale === 'number') {
        patch.subtitles.scale = clampNumber(parsed.subtitles.scale, 0.5, 2);
      }
    }

    if (parsed.danmaku) {
      patch.danmaku = {};
      if (typeof parsed.danmaku.enabled === 'boolean') {
        patch.danmaku.enabled = parsed.danmaku.enabled;
      }
      if (typeof parsed.danmaku.scrollMaxLines === 'number') {
        patch.danmaku.scrollMaxLines = Math.round(
          clampNumber(parsed.danmaku.scrollMaxLines, 1, 12)
        );
      }
      if (typeof parsed.danmaku.topMaxLines === 'number') {
        patch.danmaku.topMaxLines = Math.round(clampNumber(parsed.danmaku.topMaxLines, 1, 12));
      }
      if (typeof parsed.danmaku.bottomMaxLines === 'number') {
        patch.danmaku.bottomMaxLines = Math.round(
          clampNumber(parsed.danmaku.bottomMaxLines, 1, 12)
        );
      }
      if (typeof parsed.danmaku.scale === 'number') {
        patch.danmaku.scale = clampNumber(parsed.danmaku.scale, 0.5, 2);
      }
      if (typeof parsed.danmaku.opacity === 'number') {
        patch.danmaku.opacity = clampNumber(parsed.danmaku.opacity, 0, 1);
      }
      if (typeof parsed.danmaku.speed === 'number') {
        patch.danmaku.speed = clampNumber(parsed.danmaku.speed, 0.5, 2);
      }
    }

    return patch.playback || patch.subtitles || patch.danmaku ? patch : null;
  } catch {
    return null;
  }
}

function normalizeLaunchPlayerSettings(
  playerSettings?: Partial<LaunchPlayerSettings>
): LaunchPlayerSettings {
  const defaultSettings = createDefaultSettings();

  return {
    playback: {
      ...defaultSettings.playback,
      ...playerSettings?.playback,
    },
    subtitles: {
      ...defaultSettings.subtitles,
      ...playerSettings?.subtitles,
    },
    danmakuServers: playerSettings?.danmakuServers ?? [],
    danmaku: {
      ...defaultSettings.danmaku,
      ...playerSettings?.danmaku,
    },
  };
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

  private readonly createDanmakuFilePath: (sessionId: number) => string;

  private readonly createUiScriptFilePath: (sessionId: number) => string;

  private readonly createLogFilePath: (sessionId: number) => string;

  private readonly fileExists: (targetPath: string) => boolean;

  private readonly fetchDanmaku: FetchDanmaku;

  private readonly getWindowMaximizeBounds: () => MpvWindowBounds | null;

  private readonly onEpisodeSelect: (itemId: string) => void;

  private ipcEndpointCounter = 0;

  private readonly isPackaged: boolean;

  private readonly maxConnectAttempts: number;

  private readonly moduleDir: string;

  private readonly onPlayerSettingsPatch: (patch: PlayerSettingsPatch) => void | Promise<void>;

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
    this.createDanmakuFilePath =
      options.createDanmakuFilePath ??
      ((sessionId) =>
        path.join(os.tmpdir(), `emby-player-mpv-danmaku-${process.pid}-${sessionId}.ass`));
    this.createUiScriptFilePath =
      options.createUiScriptFilePath ??
      ((sessionId) =>
        path.join(os.tmpdir(), `emby-player-mpv-ui-${process.pid}-${sessionId}.lua`));
    this.createLogFilePath =
      options.createLogFilePath ??
      ((sessionId) => path.join(os.tmpdir(), `emby-player-mpv-${process.pid}-${sessionId}.log`));
    this.fileExists = options.fileExists ?? existsSync;
    this.fetchDanmaku =
      options.fetchDanmaku ?? ((nextInput, servers) => fetchDandanplayDanmaku(nextInput, servers));
    this.getWindowMaximizeBounds = options.getWindowMaximizeBounds ?? (() => null);
    this.isPackaged = options.isPackaged ?? process.env.NODE_ENV === 'production';
    this.maxConnectAttempts = options.maxConnectAttempts ?? 20;
    this.moduleDir = options.moduleDir ?? path.dirname(fileURLToPath(import.meta.url));
    this.onEpisodeSelect = options.onEpisodeSelect ?? (() => undefined);
    this.onPlayerSettingsPatch = options.onPlayerSettingsPatch ?? (() => undefined);
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

  async launch(
    input: LaunchMpvInput,
    proxy: ProxySettings,
    playerSettings?: Partial<LaunchPlayerSettings>
  ): Promise<void> {
    const normalizedPlayerSettings = normalizeLaunchPlayerSettings(playerSettings);
    const executablePath = this.getExecutablePath();
    const ipcServerPath = this.createIpcEndpoint();
    const sessionId = ++this.sessionCounter;
    const inputConfigFilePath = this.createInputConfigFilePath(sessionId);
    const uiScriptFilePath = this.createUiScriptFilePath(sessionId);
    const danmakuFilePath = this.createDanmakuFilePath(sessionId);
    const logFilePath = this.createLogFilePath(sessionId);
    this.writeTextFile(inputConfigFilePath, createMpvInputConfig());
    this.writeTextFile(
      uiScriptFilePath,
      createMpvUiScript(input.title, normalizedPlayerSettings, input.episodeSelector)
    );
    const args = [
      '--force-window=yes',
      '--border=no',
      '--keepaspect-window=no',
      '--osc=no',
      `--input-ipc-server=${ipcServerPath}`,
      `--input-conf=${inputConfigFilePath}`,
      `--script=${uiScriptFilePath}`,
      `--title=${input.title}`,
      `--start=${normalizeStartSeconds(input.startSeconds)}`,
      '--osd-font=Microsoft YaHei UI',
      '--osd-duration=1500',
      '--hwdec=auto-safe',
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
          danmakuFilePath,
          danmakuSettings: normalizedPlayerSettings.danmaku,
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
        this.startDanmakuLookup(
          sessionId,
          input,
          normalizedPlayerSettings.danmakuServers,
          danmakuFilePath,
          normalizedPlayerSettings.danmaku
        );
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

  async switchEpisode(
    input: LaunchMpvInput,
    proxy: ProxySettings,
    playerSettings?: Partial<LaunchPlayerSettings>
  ): Promise<void> {
    const session = this.activeSession;

    if (!session) {
      throw new Error('mpv is not running.');
    }

    const normalizedPlayerSettings = normalizeLaunchPlayerSettings(playerSettings);
    const proxyValue = getPlaybackProxyValue(input.streamUrl, proxy);

    session.itemId = input.itemId;
    session.positionSeconds = null;
    session.durationSeconds = 0;
    session.danmakuComments = [];
    session.danmakuSettings = normalizedPlayerSettings.danmaku;
    session.hasDanmakuSubtitle = false;

    this.queueSessionCommand(session.sessionId, [
      'set_property',
      'http-header-fields',
      getHttpHeaderFields(input.httpHeaders),
    ]);

    if (proxyValue !== null) {
      this.queueSessionCommand(session.sessionId, ['set_property', 'http-proxy', proxyValue]);
    }

    const { displayTitle, displaySubtitle } = splitPlaybackTitle(input.title);

    this.queueSessionCommand(session.sessionId, [
      'loadfile',
      input.streamUrl,
      'replace',
      -1,
      createLoadFileOptions(input),
    ]);
    this.queueSessionCommand(session.sessionId, [
      'script-message',
      'taluxa-active-episode',
      input.itemId,
      input.title,
      displayTitle,
      displaySubtitle,
    ]);
    this.startDanmakuLookup(
      session.sessionId,
      input,
      normalizedPlayerSettings.danmakuServers,
      session.danmakuFilePath,
      normalizedPlayerSettings.danmaku
    );
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

  private startDanmakuLookup(
    sessionId: number,
    input: LaunchMpvInput,
    danmakuServers: DanmakuServerSettings[],
    danmakuFilePath: string,
    danmakuSettings?: DanmakuSettings
  ): void {
    if (danmakuSettings?.enabled === false) {
      this.logDanmaku(sessionId, 'skipped reason=disabled');
      return;
    }

    if (danmakuServers.length === 0) {
      this.logDanmaku(sessionId, 'skipped reason=no-server');
      return;
    }

    this.logDanmaku(
      sessionId,
      `lookup start itemId=${formatDanmakuDiagnosticText(input.itemId)} title=${formatDanmakuDiagnosticText(
        input.title
      )} servers=${danmakuServers.length}`
    );
    void (async () => {
      try {
        const comments = await this.fetchDanmaku(
          {
            itemId: input.itemId,
            title: input.title,
          },
          danmakuServers
        );
        this.logDanmaku(sessionId, `lookup finished comments=${comments.length}`);

        if (comments.length === 0) {
          this.queueDanmakuNotice(sessionId, DANMAKU_NO_MATCH_NOTICE);
          return;
        }

        const session = this.activeSession;
        if (session && session.sessionId === sessionId) {
          session.danmakuComments = comments;
          session.danmakuSettings = danmakuSettings ?? createDefaultSettings().danmaku;
          session.hasDanmakuSubtitle = true;
        }

        this.writeTextFile(danmakuFilePath, toAssSubtitle(comments, danmakuSettings));
        this.queueSessionCommand(sessionId, ['sub-add', danmakuFilePath, 'select']);
        this.queueDanmakuNotice(sessionId, createDanmakuMatchedNotice(comments));
      } catch (error) {
        this.logDanmaku(
          sessionId,
          `lookup failed error=${formatDanmakuDiagnosticText(
            error instanceof Error ? error.message : String(error)
          )}`
        );
        this.queueDanmakuNotice(
          sessionId,
          isDanmakuSourceError(error) ? DANMAKU_SOURCE_ERROR_NOTICE : DANMAKU_NO_MATCH_NOTICE
        );
      }
    })();
  }

  private queueDanmakuNotice(sessionId: number, message: string): void {
    this.logDanmaku(sessionId, `notice=${formatDanmakuDiagnosticText(message)}`);
    this.queueSessionCommand(sessionId, ['show-text', message, '5000']);
  }

  private logDanmaku(sessionId: number, message: string): void {
    console.info(`[danmaku][session ${sessionId}] ${message}`);
  }

  private queueSessionCommand(sessionId: number, command: unknown[]): void {
    const session = this.activeSession;

    if (!session || session.sessionId !== sessionId) {
      return;
    }

    if (session.client && session.isReady) {
      this.writeCommand(session.client, command);
      return;
    }

    session.pendingCommands.push(command);
  }

  private flushPendingCommands(session: ActiveSession): void {
    const client = session.client;

    if (!client) {
      return;
    }

    for (const command of session.pendingCommands.splice(0)) {
      this.writeCommand(client, command);
    }
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
          args?: unknown[];
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

        if (payload.event === 'client-message' && Array.isArray(payload.args)) {
          const [name, rawPatch] = payload.args;

          if (name === 'taluxa-settings-patch') {
            const patch = parsePlayerSettingsPatch(rawPatch);

            if (patch) {
              void this.onPlayerSettingsPatch(patch);
              this.applyLiveSettingsPatch(session, patch);
            }
          }

          if (name === 'taluxa-toggle-window-maximize') {
            this.toggleWindowMaximize(session, rawPatch);
          }

          if (name === 'taluxa-select-episode' && typeof rawPatch === 'string' && rawPatch.trim()) {
            this.onEpisodeSelect(rawPatch.trim());
          }

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

  private applyLiveSettingsPatch(session: ActiveSession, patch: PlayerSettingsPatch): void {
    if (patch.danmaku) {
      session.danmakuSettings = {
        ...session.danmakuSettings,
        ...patch.danmaku,
      };
      this.refreshDanmakuSubtitle(session);
    }
  }

  private refreshDanmakuSubtitle(session: ActiveSession): void {
    if (!session.hasDanmakuSubtitle || session.danmakuComments.length === 0) {
      return;
    }

    this.writeTextFile(
      session.danmakuFilePath,
      toAssSubtitle(session.danmakuComments, session.danmakuSettings)
    );
    this.queueSessionCommand(session.sessionId, ['sub-add', session.danmakuFilePath, 'select']);
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
    this.flushPendingCommands(session);
  }

  private toggleWindowMaximize(session: ActiveSession, currentState: unknown): void {
    const client = session.client;

    if (!client) {
      return;
    }

    this.writeCommand(client, ['set_property', 'fullscreen', false]);

    if (isMpvWindowMaximized(currentState)) {
      this.writeCommand(client, ['set_property', 'window-maximized', false]);
      return;
    }

    this.writeCommand(client, ['set_property', 'window-maximized', true]);

    const bounds = normalizeWindowBounds(this.getWindowMaximizeBounds());

    if (bounds) {
      this.writeCommand(client, ['set_property', 'force-window-position', true]);
      this.writeCommand(client, ['set_property', 'geometry', formatWindowGeometry(bounds)]);
    }
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
    danmakuFilePath,
    danmakuSettings,
    ipcServerPath,
    itemId,
    logFilePath,
    onFailure,
    onReady,
    sessionId,
    stderrLines,
  }: {
    child: SpawnedMpvProcess;
    danmakuFilePath: string;
    danmakuSettings: DanmakuSettings;
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
      danmakuComments: [],
      danmakuFilePath,
      danmakuSettings,
      durationSeconds: 0,
      hasConnected: false,
      hasDanmakuSubtitle: false,
      ipcServerPath,
      isReady: false,
      itemId,
      logFilePath,
      onFailure,
      onReady,
      pendingCommands: [],
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
