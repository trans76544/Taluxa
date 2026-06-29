import { Buffer } from 'node:buffer';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

export type HlsProxyFetch = (input: string, init: RequestInit) => Promise<Response>;

export interface HlsProxySource {
  httpHeaders?: Record<string, string>;
  streamUrl: string;
}

interface HlsProxySession {
  apiKey: string;
  httpHeaders: Record<string, string>;
  remoteUrls: Map<string, string>;
}

function isHlsPlaylistUrl(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.m3u8');
  } catch {
    return false;
  }
}

function isHlsPlaylistResponse(remoteUrl: string, contentType: string): boolean {
  const normalizedContentType = contentType.toLowerCase();

  return (
    isHlsPlaylistUrl(remoteUrl) ||
    normalizedContentType.includes('mpegurl') ||
    normalizedContentType.includes('application/vnd.apple')
  );
}

function resolveHlsUri(uri: string, playlistUrl: string): string {
  return new URL(uri, playlistUrl).toString();
}

function appendApiKey(remoteUrl: string, apiKey: string): string {
  if (!apiKey) {
    return remoteUrl;
  }

  const nextUrl = new URL(remoteUrl);

  if (!nextUrl.searchParams.has('api_key')) {
    nextUrl.searchParams.set('api_key', apiKey);
  }

  return nextUrl.toString();
}

export function rewriteHlsPlaylist(
  playlist: string,
  playlistUrl: string,
  rewriteUri: (remoteUrl: string) => string
): string {
  return playlist
    .split(/\r?\n/u)
    .map((line) => {
      const trimmedLine = line.trim();

      if (!trimmedLine) {
        return line;
      }

      if (trimmedLine.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/gu, (_match, uri: string) => {
          return `URI="${rewriteUri(resolveHlsUri(uri, playlistUrl))}"`;
        });
      }

      return rewriteUri(resolveHlsUri(trimmedLine, playlistUrl));
    })
    .join('\n');
}

export class HlsProxyServer {
  private server: Server | null = null;

  private readonly fetcher: HlsProxyFetch;

  private sessions = new Map<string, HlsProxySession>();

  constructor(fetcher: HlsProxyFetch = fetch) {
    this.fetcher = fetcher;
  }

  async createProxiedUrl({ httpHeaders = {}, streamUrl }: HlsProxySource): Promise<string> {
    await this.start();

    const sourceId = randomUUID();
    this.sessions.set(sourceId, {
      apiKey: new URL(streamUrl).searchParams.get('api_key') ?? httpHeaders['X-Emby-Token'] ?? '',
      httpHeaders,
      remoteUrls: new Map(),
    });

    return this.createLocalUrl(sourceId, streamUrl);
  }

  close(): void {
    this.server?.close();
    this.server = null;
    this.sessions.clear();
  }

  private createLocalUrl(sourceId: string, remoteUrl: string): string {
    const address = this.server?.address();
    const session = this.sessions.get(sourceId);

    if (!address || typeof address === 'string' || !session) {
      throw new Error('HLS proxy server is not listening.');
    }

    const remoteId = randomUUID();
    session.remoteUrls.set(remoteId, remoteUrl);

    return `http://127.0.0.1:${address.port}/hls/${sourceId}/${remoteId}`;
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
      const [, route, sourceId, remoteId] = requestUrl.pathname.split('/');
      const session = sourceId ? this.sessions.get(sourceId) : null;
      const remoteUrl = remoteId ? session?.remoteUrls.get(remoteId) : null;

      if (route !== 'hls' || !sourceId || !session || !remoteUrl) {
        response.writeHead(404);
        response.end();
        return;
      }

      const upstreamUrl = appendApiKey(remoteUrl, session.apiKey);
      const upstreamResponse = await this.fetcher(upstreamUrl, {
        method: 'GET',
        headers: session.httpHeaders,
      });
      const contentType = upstreamResponse.headers.get('Content-Type') ?? '';

      if (isHlsPlaylistResponse(remoteUrl, contentType)) {
        const playlist = await upstreamResponse.text();
        const rewrittenPlaylist = rewriteHlsPlaylist(playlist, upstreamUrl, (nextRemoteUrl) =>
          this.createLocalUrl(sourceId, appendApiKey(nextRemoteUrl, session.apiKey))
        );

        response.writeHead(upstreamResponse.status, {
          'Content-Type': contentType || 'application/vnd.apple.mpegurl',
        });
        response.end(rewrittenPlaylist);
        return;
      }

      const body = Buffer.from(await upstreamResponse.arrayBuffer());
      const headers: Record<string, string> = {};
      upstreamResponse.headers.forEach((value, name) => {
        if (name.toLowerCase() !== 'transfer-encoding') {
          headers[name] = value;
        }
      });
      response.writeHead(upstreamResponse.status, headers);
      response.end(body);
    } catch {
      response.writeHead(502);
      response.end();
    }
  }

  private async start(): Promise<void> {
    if (this.server) {
      return;
    }

    this.server = createServer((request, response) => {
      void this.handleRequest(request, response);
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(0, '127.0.0.1', () => {
        this.server?.removeListener('error', reject);
        resolve();
      });
    });
  }
}
