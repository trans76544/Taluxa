import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { rewriteHlsPlaylist } from './hlsProxy';

export type MediaFetch = (url: string, init: RequestInit) => Promise<Response>;
export interface MediaSource { streamUrl: string; httpHeaders?: Record<string, string>; startSeconds?: number }
export interface MediaPreloadLease { streamUrl: string; ready: Promise<void> }
interface Limits {
  headBytes: number; tailBytes: number; maxSourceBytes: number; maxTotalBytes: number;
  timeoutMs: number; segments: number;
}
interface CachedResource { bytes: Buffer; contentType: string; playlist: boolean; immutable: boolean }
interface FileRange { start: number; bytes: Buffer }
interface FileCache { total: number; contentType: string; validator: string | null; ranges: FileRange[] }
interface SourceRecord {
  id: string; source: MediaSource; controller: AbortController; bytes: number; mediaBytes: number;
  urls: Map<string, string>; resources: Map<string, CachedResource>; file: FileCache | null;
  requests: Set<AbortController>;
}

const MiB = 1024 * 1024;
// Fetch/Electron reject these ports even for loopback. Windows can allocate them for listen(0).
const blockedHighPorts = new Set([1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697, 10080]);
const defaultLimits: Limits = {
  headBytes: 8 * MiB, tailBytes: MiB, maxSourceBytes: 16 * MiB,
  maxTotalBytes: 64 * MiB, timeoutMs: 12_000, segments: 3,
};
function isPlaylist(url: string, type = ''): boolean {
  return new URL(url).pathname.toLowerCase().endsWith('.m3u8') || /mpegurl/i.test(type);
}
function contentRange(response: Response): { start: number; end: number; total: number } | null {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') ?? '');
  if (!match) return null;
  const [start, end, total] = match.slice(1).map(Number);
  return Number.isSafeInteger(total) && total > end && end >= start ? { start, end, total } : null;
}
function requestedRange(value: string | undefined, total: number): { start: number; end: number } | null {
  if (!value) return { start: 0, end: total - 1 };
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, total - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start <= end && end < total
    ? { start, end } : null;
}

/** A bounded, ephemeral cache whose playback URL serves the same prefetched bytes to mpv. */
export class MediaPreloadProxy {
  private server: Server | null = null;
  private starting: Promise<void> | null = null;
  private readonly records = new Map<string, SourceRecord>();
  private totalBytes = 0;
  private closed = false;
  private readonly limits: Limits;

  constructor(private readonly fetcher: MediaFetch = fetch, limits: Partial<Limits> = {}) {
    this.limits = { ...defaultLimits, ...limits };
  }
  get cachedBytes(): number { return this.totalBytes; }

  async create(source: MediaSource): Promise<MediaPreloadLease> {
    if (!/^https?:$/.test(new URL(source.streamUrl).protocol)) throw new Error('Unsupported media source.');
    await this.start();
    if (this.closed) throw new Error('Media cache is closed.');
    const record: SourceRecord = {
      id: randomUUID(), source: { ...source, httpHeaders: { ...source.httpHeaders } },
      controller: new AbortController(), bytes: 0, mediaBytes: 0,
      urls: new Map(), resources: new Map(), file: null, requests: new Set(),
    };
    this.records.set(record.id, record);
    const streamUrl = this.localUrl(record, source.streamUrl);
    const ready = this.warm(record);
    // The owner observes failures; attach a handler immediately for release/close races.
    void ready.catch(() => undefined);
    return { streamUrl, ready };
  }

  hasData(streamUrl: string): boolean {
    const record = this.recordForUrl(streamUrl);
    return !!record && record.mediaBytes > 0;
  }

  release(streamUrl: string): void {
    const record = this.recordForUrl(streamUrl);
    if (!record) return;
    this.records.delete(record.id);
    this.totalBytes -= record.bytes;
    record.controller.abort();
    for (const request of record.requests) request.abort();
    record.resources.clear();
    record.urls.clear();
    record.file = null;
  }

  close(): void {
    this.closed = true;
    for (const record of this.records.values()) {
      record.controller.abort();
      for (const request of record.requests) request.abort();
    }
    this.records.clear();
    this.totalBytes = 0;
    this.server?.closeAllConnections();
    this.server?.close();
    this.server = null;
    this.starting = null;
  }

  private recordForUrl(url: string): SourceRecord | undefined {
    try { return this.records.get(new URL(url).pathname.split('/')[2]); } catch { return undefined; }
  }
  private localUrl(record: SourceRecord, remoteUrl: string): string {
    const address = this.server?.address();
    if (!address || typeof address === 'string') throw new Error('Media cache is unavailable.');
    let resourceId = record.urls.get(remoteUrl);
    if (!resourceId) { resourceId = randomUUID(); record.urls.set(remoteUrl, resourceId); }
    return `http://127.0.0.1:${address.port}/media/${record.id}/${resourceId}`;
  }
  private available(record: SourceRecord): number {
    return Math.max(0, Math.min(this.limits.maxSourceBytes - record.bytes, this.limits.maxTotalBytes - this.totalBytes));
  }
  private store(record: SourceRecord, bytes: Buffer, media = true): boolean {
    if (this.records.get(record.id) !== record || bytes.length > this.available(record)) return false;
    record.bytes += bytes.length;
    this.totalBytes += bytes.length;
    if (media) record.mediaBytes += bytes.length;
    return true;
  }
  private async readBounded(response: Response, limit: number, complete: boolean): Promise<Buffer | null> {
    if (!response.body || limit <= 0) { await response.body?.cancel(); return null; }
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let length = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) return Buffer.concat(chunks, length);
        const remaining = limit - length;
        if (value.length > remaining) {
          if (complete) return null;
          chunks.push(Buffer.from(value.subarray(0, remaining)));
          return Buffer.concat(chunks, limit);
        }
        chunks.push(Buffer.from(value)); length += value.length;
        if (!complete && length === limit) return Buffer.concat(chunks, length);
      }
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  }
  private upstreamUrl(record: SourceRecord, url: string): string {
    const next = new URL(url);
    const root = new URL(record.source.streamUrl);
    const token = root.searchParams.get('api_key') ?? new Headers(record.source.httpHeaders).get('x-emby-token');
    if (token && next.origin === root.origin && isPlaylist(root.href) && !next.searchParams.has('api_key')) {
      next.searchParams.set('api_key', token);
    }
    return next.href;
  }
  private fetch(record: SourceRecord, url: string, signal: AbortSignal, range?: string, validator?: string | null): Promise<Response> {
    const headers = new Headers(record.source.httpHeaders);
    // Media cache offsets refer to the identity representation, never compressed bytes.
    headers.set('Accept-Encoding', 'identity');
    if (new URL(url).origin !== new URL(record.source.streamUrl).origin) {
      headers.delete('Authorization'); headers.delete('X-Emby-Token');
    }
    if (range) headers.set('Range', range); else headers.delete('Range');
    if (validator) headers.set('If-Range', validator);
    return this.fetcher(this.upstreamUrl(record, url), { method: 'GET', headers: Object.fromEntries(headers.entries()), signal });
  }

  private async warm(record: SourceRecord): Promise<void> {
    const timeout = setTimeout(() => record.controller.abort(), this.limits.timeoutMs);
    try {
      if (isPlaylist(record.source.streamUrl)) await this.warmPlaylist(record, record.source.streamUrl, 0);
      else await this.warmFile(record);
    } finally { clearTimeout(timeout); }
  }
  private async warmFile(record: SourceRecord): Promise<void> {
    const size = Math.min(this.limits.headBytes, this.available(record));
    if (size <= 0) return;
    const response = await this.fetch(record, record.source.streamUrl, record.controller.signal, `bytes=0-${size - 1}`);
    if (!response.ok) { await response.body?.cancel(); throw new Error('Media preparation failed.'); }
    if (isPlaylist(record.source.streamUrl, response.headers.get('content-type') ?? '')) {
      await this.warmPlaylist(record, record.source.streamUrl, 0, response); return;
    }
    const range = contentRange(response);
    const total = response.status === 206 && range?.start === 0 ? range.total
      : response.status === 200 ? Number(response.headers.get('content-length')) : 0;
    if (!Number.isSafeInteger(total) || total <= 0 ||
        (response.headers.get('content-encoding') ?? 'identity') !== 'identity') {
      await response.body?.cancel(); return;
    }
    const bytes = await this.readBounded(response, Math.min(size, total), false);
    if (!bytes || !this.store(record, bytes)) return;
    record.file = {
      total, contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      validator: this.validator(response),
      ranges: [{ start: 0, bytes }],
    };
    const tailSize = Math.min(this.limits.tailBytes, total - bytes.length, this.available(record));
    if (tailSize <= 0 || response.status !== 206) return;
    const tailStart = total - tailSize;
    const tailResponse = await this.fetch(record, record.source.streamUrl, record.controller.signal, `bytes=${tailStart}-${total - 1}`, record.file.validator);
    const tailRange = contentRange(tailResponse);
    const tailValidator = this.validator(tailResponse);
    if (tailResponse.status !== 206 || tailRange?.start !== tailStart || tailRange.end !== total - 1 || tailRange.total !== total ||
        (tailResponse.headers.get('content-encoding') ?? 'identity') !== 'identity' ||
        (tailValidator && record.file?.validator && tailValidator !== record.file.validator)) {
      await tailResponse.body?.cancel(); return;
    }
    const tail = await this.readBounded(tailResponse, tailSize, true);
    if (tail && tail.length === tailSize && this.store(record, tail)) record.file?.ranges.push({ start: tailStart, bytes: tail });
  }

  private async warmPlaylist(record: SourceRecord, url: string, depth: number, existing?: Response): Promise<void> {
    if (depth > 3 || this.available(record) <= 0 || record.resources.has(url)) return;
    const response = existing ?? await this.fetch(record, url, record.controller.signal);
    if (!response.ok) { await response.body?.cancel(); throw new Error('Playlist preparation failed.'); }
    const bytes = await this.readBounded(response, Math.min(512 * 1024, this.available(record)), true);
    if (!bytes || !this.store(record, bytes, false)) return;
    const text = bytes.toString('utf8');
    const master = text.includes('#EXT-X-STREAM-INF:');
    record.resources.set(url, { bytes, contentType: 'application/vnd.apple.mpegurl', playlist: true, immutable: master || text.includes('#EXT-X-ENDLIST') });
    const lines = text.split(/\r?\n/).map(line => line.trim());
    if (master) {
      const variants = lines.flatMap((line, i) => line.startsWith('#EXT-X-STREAM-INF:') && lines[i + 1] && !lines[i + 1].startsWith('#')
        ? [{ url: new URL(lines[i + 1], url).href, bandwidth: Number(/(?:^|[, :])BANDWIDTH=(\d+)/.exec(line)?.[1] ?? 0) }] : []);
      variants.sort((a, b) => b.bandwidth - a.bandwidth);
      if (variants[0]) await this.warmPlaylist(record, variants[0].url, depth + 1);
      const audio = lines.find(line => line.startsWith('#EXT-X-MEDIA:') && line.includes('TYPE=AUDIO') && line.includes('DEFAULT=YES'));
      const audioUri = audio && /URI="([^"]+)"/.exec(audio)?.[1];
      if (audioUri) await this.warmPlaylist(record, new URL(audioUri, url).href, depth + 1);
      return;
    }
    // Byte-range HLS resources are forwarded rather than cached as complete segments.
    if (text.includes('#EXT-X-BYTERANGE') || /#EXT-X-MAP:.*BYTERANGE=/.test(text)) return;
    let elapsed = 0, duration = 0, count = 0;
    let mapDependencies: string[] = [];
    const keys = new Map<string, string>();
    for (const line of lines) {
      if (line.startsWith('#EXT-X-KEY:')) {
        const format = /KEYFORMAT="([^"]+)"/.exec(line)?.[1] ?? 'identity';
        const uri = /URI="([^"]+)"/.exec(line)?.[1];
        if (/(?:^|[:,])METHOD=NONE(?:,|$)/.test(line)) keys.clear();
        else if (uri) keys.set(format, new URL(uri, url).href);
      } else if (line.startsWith('#EXT-X-MAP:')) {
        const uri = /URI="([^"]+)"/.exec(line)?.[1];
        // An encrypted init section retains the key in effect at its declaration.
        mapDependencies = uri ? [new URL(uri, url).href, ...keys.values()] : [];
      } else if (line.startsWith('#EXTINF:')) duration = Number(line.slice(8).split(',')[0]) || 0;
      else if (line && !line.startsWith('#')) {
        const end = elapsed + duration;
        if (end > (record.source.startSeconds ?? 0) && count < this.limits.segments) {
          for (const dependency of new Set([...mapDependencies, ...keys.values()])) await this.warmResource(record, dependency);
          await this.warmResource(record, new URL(line, url).href);
          count++;
        }
        elapsed = end;
        if (count >= this.limits.segments || this.available(record) <= 0) break;
      }
    }
  }
  private async warmResource(record: SourceRecord, url: string): Promise<void> {
    if (record.resources.has(url) || this.available(record) <= 0) return;
    const response = await this.fetch(record, url, record.controller.signal);
    if (!response.ok) { await response.body?.cancel(); return; }
    const bytes = await this.readBounded(response, this.available(record), true);
    if (bytes && this.store(record, bytes)) record.resources.set(url, {
      bytes, contentType: response.headers.get('content-type') ?? 'application/octet-stream', playlist: false, immutable: true,
    });
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const controller = new AbortController();
    response.once('close', () => controller.abort());
    try {
      const [, route, id, resourceId] = new URL(request.url ?? '/', 'http://127.0.0.1').pathname.split('/');
      const record = this.records.get(id);
      const url = record && [...record.urls].find(([, value]) => value === resourceId)?.[0];
      if (route !== 'media' || !record || !url) { response.writeHead(404); response.end(); return; }
      if (!['GET', 'HEAD'].includes(request.method ?? '') || request.headers.origin) { response.writeHead(403); response.end(); return; }
      record.requests.add(controller);
      response.once('close', () => record.requests.delete(controller));
      const cached = record.resources.get(url);
      if (cached?.immutable) {
        if (cached.playlist) this.sendPlaylist(record, url, cached.bytes.toString('utf8'), response, request.method === 'HEAD');
        else this.sendBytes(cached.bytes, cached.contentType, request, response);
        return;
      }
      if (url === record.source.streamUrl && record.file &&
          await this.sendFile(record, request, response, controller.signal)) return;
      await this.forward(record, url, request, response, controller.signal);
    } catch {
      if (!response.headersSent) { response.writeHead(502); response.end(); }
      else response.destroy();
    }
  }
  private sendBytes(bytes: Buffer, type: string, request: IncomingMessage, response: ServerResponse): void {
    const range = requestedRange(request.headers.range, bytes.length);
    if (!range) { response.writeHead(416, { 'Content-Range': `bytes */${bytes.length}` }); response.end(); return; }
    response.writeHead(request.headers.range ? 206 : 200, {
      'Content-Type': type, 'Content-Length': range.end - range.start + 1, 'Accept-Ranges': 'bytes',
      ...(request.headers.range ? { 'Content-Range': `bytes ${range.start}-${range.end}/${bytes.length}` } : {}),
    });
    response.end(request.method === 'HEAD' ? undefined : bytes.subarray(range.start, range.end + 1));
  }
  private sendPlaylist(record: SourceRecord, url: string, text: string, response: ServerResponse, head: boolean): void {
    const rewritten = rewriteHlsPlaylist(text, url, remote => this.localUrl(record, remote));
    response.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl', 'Content-Length': Buffer.byteLength(rewritten) });
    response.end(head ? undefined : rewritten);
  }
  private async sendFile(record: SourceRecord, request: IncomingMessage, response: ServerResponse, signal: AbortSignal): Promise<boolean> {
    const file = record.file!;
    const range = requestedRange(request.headers.range, file.total);
    if (!range) return false;
    const cached = file.ranges.find(part => part.start <= range.start && part.start + part.bytes.length > range.start);
    if (!cached && request.method !== 'HEAD') return false;
    const cachedEnd = cached ? Math.min(range.end, cached.start + cached.bytes.length - 1) : range.start - 1;
    response.writeHead(request.headers.range ? 206 : 200, {
      'Content-Type': file.contentType, 'Content-Length': range.end - range.start + 1, 'Accept-Ranges': 'bytes',
      ...(request.headers.range ? { 'Content-Range': `bytes ${range.start}-${range.end}/${file.total}` } : {}),
    });
    if (request.method === 'HEAD') { response.end(); return true; }
    if (cached) response.write(cached.bytes.subarray(range.start - cached.start, cachedEnd - cached.start + 1));
    if (cachedEnd < range.end) {
      // Deliver the playable prefix immediately, without waiting for origin RTT.
      // Never append bytes from a changed entity to a response already in flight.
      const upstream = await this.fetch(record, record.source.streamUrl, signal, `bytes=${cachedEnd + 1}-${range.end}`, file.validator);
      const actual = contentRange(upstream);
      const validator = this.validator(upstream);
      const validRange = upstream.status === 206 && actual?.start === cachedEnd + 1 && actual.end === range.end && actual.total === file.total;
      const wholeFile = upstream.status === 200 && Number(upstream.headers.get('content-length')) === file.total;
      if ((!validRange && !wholeFile) ||
          (upstream.headers.get('content-encoding') ?? 'identity') !== 'identity' ||
          (wholeFile && file.validator && validator !== file.validator) ||
          (validator && file.validator && validator !== file.validator)) {
        await upstream.body?.cancel();
        if (record.file === file) {
          const size = file.ranges.reduce((total, part) => total + part.bytes.length, 0);
          record.file = null;
          record.controller.abort();
          record.bytes -= size; record.mediaBytes -= size; this.totalBytes -= size;
        }
        throw new Error('Media representation changed.');
      }
      if (upstream.body) {
        const stream = wholeFile
          ? Readable.from(this.sliceBody(upstream.body, cachedEnd + 1, range.end - cachedEnd))
          : Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);
        await pipeline(stream, response, { signal });
      }
      else response.end();
    } else response.end();
    return true;
  }
  private async *sliceBody(body: ReadableStream<Uint8Array>, skip: number, remaining: number): AsyncGenerator<Uint8Array> {
    const reader = body.getReader();
    try {
      while (remaining > 0) {
        const { value, done } = await reader.read();
        if (done) throw new Error('Incomplete media response.');
        const offset = Math.min(skip, value.length);
        skip -= offset;
        const bytes = value.subarray(offset, Math.min(value.length, offset + remaining));
        remaining -= bytes.length;
        if (bytes.length) yield bytes;
      }
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  }
  private async forward(record: SourceRecord, url: string, request: IncomingMessage, response: ServerResponse, signal: AbortSignal): Promise<void> {
    const upstream = await this.fetch(record, url, signal, request.headers.range);
    const type = upstream.headers.get('content-type') ?? '';
    if (upstream.ok && isPlaylist(url, type)) {
      const bytes = await this.readBounded(upstream, MiB, true);
      if (!bytes) throw new Error('Invalid playlist.');
      this.sendPlaylist(record, url, bytes.toString('utf8'), response, request.method === 'HEAD'); return;
    }
    const headers: Record<string, string> = {};
    for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
      const value = upstream.headers.get(name); if (value !== null) headers[name] = value;
    }
    // Fetch has already decoded compressed response bodies.
    if (upstream.headers.has('content-encoding')) delete headers['content-length'];
    response.writeHead(upstream.status, headers);
    if (request.method === 'HEAD' || !upstream.body) { await upstream.body?.cancel(); response.end(); return; }
    await pipeline(Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]), response, { signal });
  }
  private async start(): Promise<void> {
    if (this.closed) throw new Error('Media cache is closed.');
    if (this.starting) return this.starting;
    const server = createServer((request, response) => { void this.handle(request, response); });
    this.server = server;
    this.starting = new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      const listening = () => {
        const address = server.address();
        if (!this.closed && address && typeof address !== 'string' &&
            (address.port < 1024 || blockedHighPorts.has(address.port))) {
          server.close(() => server.listen(0, '127.0.0.1', listening)); return;
        }
        server.removeListener('error', reject);
        if (this.closed) server.close();
        resolve();
      };
      server.listen(0, '127.0.0.1', listening);
    });
    return this.starting;
  }
  private validator(response: Response): string | null {
    const etag = response.headers.get('etag');
    return etag && !etag.startsWith('W/') ? etag : response.headers.get('last-modified');
  }
}
