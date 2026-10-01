import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MpvController,
  type LaunchMpvInput,
  type SpawnedMpvProcess,
} from '../../electron/main/player/mpvController';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const resultTag = 'TALUXA_LUA_RESULT:';
export const mpvLuaAvailable = process.platform === 'win32';
export const mpvLuaUnavailableReason = 'Bundled Windows mpv Lua integration is unavailable on this platform';

/** Capture the complete private generator output through the ordinary controller launch path. */
export async function captureMpvUiScript(episodeSelector?: LaunchMpvInput['episodeSelector']): Promise<string> {
  class FakeProcess extends EventEmitter implements SpawnedMpvProcess {
    readonly stderr = new EventEmitter();
    kill = () => true;
    unref = () => undefined;
  }
  class FakeIpc extends EventEmitter {
    destroy = () => undefined;
    setEncoding = () => this;
    write = () => true;
  }
  const child = new FakeProcess();
  const ipc = new FakeIpc();
  let script = '';
  const scriptPath = path.join(repoRoot, 'captured-test-ui.lua');
  const controller = new MpvController({
    moduleDir: path.join(repoRoot, 'src', 'electron', 'main', 'player'),
    isPackaged: false,
    fileExists: () => true,
    createInputConfigFilePath: () => path.join(repoRoot, 'captured-test-input.conf'),
    createUiScriptFilePath: () => scriptPath,
    createDanmakuFilePath: () => path.join(repoRoot, 'captured-test-danmaku.ass'),
    createLogFilePath: () => path.join(repoRoot, 'captured-test.log'),
    createIpcEndpoint: () => 'test-only-ipc',
    spawnProcess: () => child,
    connectIpc: () => ipc,
    writeTextFile: (target, content) => { if (target === scriptPath) script = content; },
    removeFile: () => undefined,
  });
  const launched = controller.launch({
    itemId: 'test-item', title: 'Test media', streamUrl: 'test-only-no-network', episodeSelector,
  }, { mode: 'direct', customProxyUrl: '' });
  child.emit('spawn');
  ipc.emit('connect');
  ipc.emit('data', Buffer.from('{"event":"file-loaded"}\n'));
  await launched;
  child.emit('exit', 0);
  if (!script) throw new Error('Controller did not generate an mpv UI script');
  return script;
}

export interface LuaRunOptions {
  properties?: Record<string, unknown>;
  timeoutMs?: number;
  runtimePath?: string;
}

/** Execute only in a fresh temporary directory; no shell, media input or user mpv configuration. */
export async function runMpvLuaChunk<T = Record<string, unknown>>(
  chunk: string, options: LuaRunOptions = {},
): Promise<T> {
  if (!mpvLuaAvailable) throw new Error(mpvLuaUnavailableReason);
  // Invoke the executable directly: mpv.com spawns a descendant that survives
  // execFile timeout, and Windows sandbox permissions prevent taskkill /T cleanup.
  const runtime = options.runtimePath ?? path.join(repoRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
  if (!existsSync(runtime)) {
    throw new Error(`Bundled mpv Lua runtime missing at ${runtime}. Restore vendor/mpv/windows-x64/mpv.exe before running the UI integration tests.`);
  }
  const tempRoot = path.resolve(os.tmpdir());
  const directory = await mkdtemp(path.join(tempRoot, 'taluxa-lua-'));
  try {
    const scriptPath = path.join(directory, 'test.lua');
    await writeFile(scriptPath, chunk, 'utf8');
    const output = await new Promise<string>((resolve, reject) => {
      const timeoutMs = options.timeoutMs ?? 10_000;
      const child = execFile(runtime, [
        '--no-config', '--load-scripts=no', '--osc=no', '--ytdl=no', '--idle=yes',
        // Windows SMTC shutdown hangs with null output in the bundled build.
        '--terminal=yes', '--media-controls=no', '--vo=null', '--ao=null', `--script=${scriptPath}`,
      ], { windowsHide: true, timeout: timeoutMs, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) reject(new Error(`mpv Lua execution failed: ${error.message}\n${stdout}\n${stderr}`));
        else resolve(`${stdout}\n${stderr}`);
      });
      // The harness never consumes terminal input.
      child.stdin?.end();
    });
    const results = output.split(/\r?\n/).filter((line) => line.includes(resultTag));
    if (results.length !== 1) throw new Error(`Expected one ${resultTag} result; received ${results.length}\n${output}`);
    const result = JSON.parse(results[0].slice(results[0].indexOf(resultTag) + resultTag.length)) as {
      passed?: boolean; error?: string; data: T;
    };
    if (result.passed !== true) throw new Error(`Lua assertions failed: ${result.error ?? 'invalid passing result'}`);
    return result.data;
  } finally {
    // mkdtemp owns this exact directory. Refuse cleanup if its resolved parent ever differs.
    if (path.dirname(path.resolve(directory)) !== tempRoot || !path.basename(directory).startsWith('taluxa-lua-')) {
      throw new Error(`Refusing to remove unexpected Lua temporary directory: ${directory}`);
    }
    await rm(directory, { recursive: true, force: true });
  }
}

/** Inspections share the generated Lua chunk's lexical scope, so all geometry is production geometry. */
export function runMpvUiLua<T = Record<string, unknown>>(
  script: string, inspection: string, options: LuaRunOptions = {},
): Promise<T> {
  const properties = JSON.stringify({ 'osd-width': 960, 'osd-height': 540, 'display-hidpi-scale': 1, ...options.properties });
  const literal = `[====[${properties}]====]`;
  return runMpvLuaChunk<T>(String.raw`
local real_mp = require 'mp'
local real_utils = require 'mp.utils'
local h = {
  properties = real_utils.parse_json(${literal}), observers = {}, bindings = {}, messages = {},
  timers = {}, commands = {}, overlays = {}, time = 0,
}
function h.eq(actual, expected, message)
  assert(actual == expected, (message or 'values differ') .. ': expected ' .. tostring(expected) .. ', got ' .. tostring(actual))
end
function h.near(actual, expected, message)
  assert(math.abs(actual - expected) < 0.0001, (message or 'values differ') .. ': expected ' .. tostring(expected) .. ', got ' .. tostring(actual))
end
function h.observe(name, value)
  h.properties[name] = value
  for _, callback in ipairs(h.observers[name] or {}) do callback(name, value) end
end
function h.clear_commands() h.commands = {} end
function h.find_commands(name, property)
  local found = {}
  for _, command in ipairs(h.commands) do
    if command[1] == name and (not property or command[2] == property) then found[#found + 1] = command end
  end
  return found
end
function h.flush_timers()
  local pending = h.timers
  h.timers = {}
  for _, timer in ipairs(pending) do if timer.active then timer.callback() end end
end
local mock = {}
function mock.get_property_native(name, fallback)
  local value = h.properties[name]
  if value == nil then return fallback end
  return value
end
mock.get_property_number = mock.get_property_native
mock.get_property_bool = mock.get_property_native
function mock.get_time() return h.time end
function mock.commandv(...) h.commands[#h.commands + 1] = {...} end
function mock.observe_property(name, kind, callback)
  h.observers[name] = h.observers[name] or {}
  table.insert(h.observers[name], callback)
end
function mock.add_forced_key_binding(key, name, callback, flags) h.bindings[name] = callback end
function mock.register_script_message(name, callback) h.messages[name] = callback end
function mock.add_timeout(delay, callback)
  local timer = {delay = delay, callback = callback, active = true}
  function timer:kill() self.active = false end
  h.timers[#h.timers + 1] = timer
  return timer
end
mock.add_periodic_timer = mock.add_timeout
function mock.create_osd_overlay(kind)
  local value = {kind = kind, updates = 0}
  function value:update() self.updates = self.updates + 1 end
  function value:remove() self.removed = true end
  h.overlays[#h.overlays + 1] = value
  return value
end
package.loaded['mp'] = mock
local passed, data = xpcall(function()
${script}
${inspection}
end, debug.traceback)
package.loaded['mp'] = real_mp
print('${resultTag}' .. real_utils.format_json({passed = passed, data = passed and data or {}, error = not passed and tostring(data) or nil}))
real_mp.commandv('quit', passed and '0' or '1')
`, options);
}
