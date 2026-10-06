// @vitest-environment node
import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { MediaPreloadProxy } from './mediaPreloadProxy';
import { mpvLuaAvailable, runMpvLuaChunk } from '../../../test/helpers/mpvLuaHarness';

/** A tiny, valid uncompressed AVI with ten actual video frames, generated without codecs/tools. */
function testVideo(): Buffer {
  function chunk(name: string, payload: Buffer): Buffer {
    const header = Buffer.alloc(8); header.write(name); header.writeUInt32LE(payload.length, 4);
    return Buffer.concat([header, payload, payload.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  }
  function list(name: string, parts: Buffer[]): Buffer { return chunk('LIST', Buffer.concat([Buffer.from(name), ...parts])); }
  const aviHeader = Buffer.alloc(56);
  aviHeader.writeUInt32LE(100000, 0); aviHeader.writeUInt32LE(160, 4); aviHeader.writeUInt32LE(16, 12);
  aviHeader.writeUInt32LE(10, 16); aviHeader.writeUInt32LE(1, 24); aviHeader.writeUInt32LE(16, 28);
  aviHeader.writeUInt32LE(2, 32); aviHeader.writeUInt32LE(2, 36);
  const streamHeader = Buffer.alloc(56);
  streamHeader.write('vidsDIB '); streamHeader.writeUInt32LE(1, 20); streamHeader.writeUInt32LE(10, 24);
  streamHeader.writeUInt32LE(10, 32); streamHeader.writeUInt32LE(16, 36); streamHeader.writeUInt32LE(0xffffffff, 40);
  streamHeader.writeInt16LE(2, 52); streamHeader.writeInt16LE(2, 54);
  const bitmapHeader = Buffer.alloc(40);
  bitmapHeader.writeUInt32LE(40, 0); bitmapHeader.writeInt32LE(2, 4); bitmapHeader.writeInt32LE(2, 8);
  bitmapHeader.writeUInt16LE(1, 12); bitmapHeader.writeUInt16LE(24, 14); bitmapHeader.writeUInt32LE(16, 20);
  const index = Buffer.alloc(16 * 10);
  const frames = Array.from({ length: 10 }, (_, i) => {
    index.write('00db', i * 16); index.writeUInt32LE(16, i * 16 + 4);
    index.writeUInt32LE(4 + i * 24, i * 16 + 8); index.writeUInt32LE(16, i * 16 + 12);
    return chunk('00db', Buffer.from([i * 20, 0, 255, 0, 255, 0, 0, 0, 255, 0, 0, i * 20, 255, 255, 0, 0]));
  });
  return chunk('RIFF', Buffer.concat([
    Buffer.from('AVI '), list('hdrl', [chunk('avih', aviHeader), list('strl', [chunk('strh', streamHeader), chunk('strf', bitmapHeader)])]),
    list('movi', frames), chunk('idx1', index),
  ]));
}

describe.skipIf(!mpvLuaAvailable)('bundled mpv consumes prefetched video bytes', () => {
  it('decodes from a partial prefix while the uncached upstream response is still stalled', async () => {
    const smallVideo = testVideo();
    const junk = Buffer.alloc(256 * 1024); junk.write('JUNK'); junk.writeUInt32LE(junk.length - 8, 4);
    const video = Buffer.concat([smallVideo, junk]); video.writeUInt32LE(video.length - 8, 4);
    let prepared = false;
    let remainderRequested = false;
    const proxy = new MediaPreloadProxy(async (_url, init) => {
      if (prepared) {
        remainderRequested = true;
        return new Promise<Response>((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted'))));
      }
      return new Response(new Uint8Array(video.subarray(0, 8192)), {
        status: 206, headers: { 'Content-Type': 'video/x-msvideo', 'Content-Range': `bytes 0-8191/${video.length}`, ETag: '"fixture"' },
      });
    }, { headBytes: 8192, tailBytes: 0 });
    try {
      const lease = await proxy.create({ streamUrl: 'https://media.example/episode.avi' });
      await lease.ready;
      prepared = true;
      expect(proxy.cachedBytes).toBe(8192);
      const result = await runMpvLuaChunk<{ width: number; height: number }>(`
local mp = require 'mp'
local utils = require 'mp.utils'
local finished = false
local function done(passed, data, message)
  if finished then return end
  finished = true
  print('TALUXA_LUA_RESULT:' .. utils.format_json({passed=passed, data=data, error=message}))
  mp.commandv('quit', passed and '0' or '1')
end
mp.register_event('playback-restart', function()
  local params = mp.get_property_native('video-params') or {}
  done(params.w == 2 and params.h == 2, {width=params.w, height=params.h}, 'Video did not decode')
end)
mp.add_timeout(8, function() done(false, {}, 'No decoded video frame from partial cache') end)
mp.commandv('loadfile', ${JSON.stringify(lease.streamUrl)}, 'replace')
`);
      expect(result).toEqual({ width: 2, height: 2 });
      expect(remainderRequested).toBe(true);
    } finally { proxy.close(); }
  }, 15_000);

  it('decodes the first video frame after the upstream media server is taken offline', async () => {
    const video = testVideo();
    let requests = 0;
    const upstream = createServer((_req, res) => {
      requests++;
      res.writeHead(200, { 'Content-Type': 'video/x-msvideo', 'Content-Length': video.length });
      res.end(video);
    });
    await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
    const address = upstream.address();
    if (!address || typeof address === 'string') throw new Error('No fixture HTTP server.');
    const proxy = new MediaPreloadProxy();
    try {
      const lease = await proxy.create({ streamUrl: `http://127.0.0.1:${address.port}/episode.avi` });
      await lease.ready;
      expect(proxy.cachedBytes).toBe(video.length);
      upstream.closeAllConnections();
      await new Promise<void>(resolve => upstream.close(() => resolve()));
      const result = await runMpvLuaChunk<{ width: number; height: number }>(`
local mp = require 'mp'
local utils = require 'mp.utils'
local finished = false
local function done(passed, data, message)
  if finished then return end
  finished = true
  print('TALUXA_LUA_RESULT:' .. utils.format_json({passed=passed, data=data, error=message}))
  mp.commandv('quit', passed and '0' or '1')
end
mp.register_event('playback-restart', function()
  local params = mp.get_property_native('video-params') or {}
  done(params.w == 2 and params.h == 2, {width=params.w, height=params.h}, 'Video did not decode')
end)
mp.add_timeout(8, function() done(false, {}, 'No decoded video frame') end)
mp.commandv('loadfile', ${JSON.stringify(lease.streamUrl)}, 'replace')
`);
      expect(result).toEqual({ width: 2, height: 2 });
      expect(requests).toBe(1);
    } finally {
      proxy.close(); upstream.closeAllConnections(); upstream.close();
    }
  }, 15_000);
});
