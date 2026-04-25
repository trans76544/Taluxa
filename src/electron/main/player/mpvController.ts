import { spawn, type SpawnOptions } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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

export interface MpvControllerOptions {
  connectIpc?: ConnectIpc;
  connectRetryDelayMs?: number;
  connectTimeoutMs?: number;
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

  constructor(options: MpvControllerOptions = {}) {
    this.connectIpc = options.connectIpc ?? ((ipcServerPath) => createConnection(ipcServerPath));
    this.connectRetryDelayMs = options.connectRetryDelayMs ?? 100;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 5000;
    this.createIpcEndpoint =
      options.createIpcEndpoint ?? (() => this.createDefaultIpcEndpoint());
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
    const logFilePath = this.createLogFilePath(sessionId);
    const args = [
      '--force-window=yes',
      `--input-ipc-server=${ipcServerPath}`,
      `--title=${input.title}`,
      `--start=${normalizeStartSeconds(input.startSeconds)}`,
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
    client.write(`${JSON.stringify({ command: ['observe_property', requestId, propertyName] })}\n`);
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
