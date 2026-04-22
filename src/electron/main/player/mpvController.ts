import { spawn, type SpawnOptions } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProxySettings } from '@shared/models/settings';

export interface LaunchMpvInput {
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
  removeListener(event: 'error', listener: (error: Error) => void): this;
  removeListener(
    event: 'exit',
    listener: (code: number | null, signal: NodeJS.Signals | null) => void
  ): this;
  removeListener(event: 'spawn', listener: () => void): this;
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
  client: MpvIpcClient | null;
  connectAttempt: number;
  connectTimeout: NodeJS.Timeout | null;
  durationSeconds: number;
  ipcServerPath: string;
  isReady: boolean;
  itemId: string;
  onFailure: (error: Error) => void;
  onReady: () => void;
  positionSeconds: number | null;
  retryTimeout: NodeJS.Timeout | null;
  sessionId: number;
}

export interface MpvControllerOptions {
  connectIpc?: ConnectIpc;
  connectRetryDelayMs?: number;
  connectTimeoutMs?: number;
  createIpcEndpoint?: () => string;
  fileExists?: (targetPath: string) => boolean;
  isPackaged?: boolean;
  maxConnectAttempts?: number;
  moduleDir?: string;
  onProgress?: (snapshot: MpvProgressSnapshot) => void;
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

function isRetryableIpcError(error: Error): boolean {
  const errorCode = (error as NodeJS.ErrnoException).code;

  return errorCode === 'ECONNREFUSED' || errorCode === 'ENOENT';
}

function getProxyArgs(proxy: ProxySettings): string[] {
  if (proxy.mode === 'direct') {
    return ['--no-http-proxy'];
  }

  if (proxy.mode === 'custom') {
    return [`--http-proxy=${proxy.customProxyUrl}`];
  }

  return [];
}

export class MpvController {
  private activeSession: ActiveSession | null = null;

  private readonly connectIpc: ConnectIpc;

  private readonly connectRetryDelayMs: number;

  private readonly connectTimeoutMs: number;

  private readonly createIpcEndpoint: () => string;

  private readonly fileExists: (targetPath: string) => boolean;

  private ipcEndpointCounter = 0;

  private readonly isPackaged: boolean;

  private readonly maxConnectAttempts: number;

  private readonly moduleDir: string;

  private readonly onProgress: (snapshot: MpvProgressSnapshot) => void;

  private readonly resourcesPath: string;

  private sessionCounter = 0;

  private readonly spawnProcess: SpawnProcess;

  constructor(options: MpvControllerOptions = {}) {
    this.connectIpc = options.connectIpc ?? ((ipcServerPath) => createConnection(ipcServerPath));
    this.connectRetryDelayMs = options.connectRetryDelayMs ?? 100;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 5000;
    this.createIpcEndpoint =
      options.createIpcEndpoint ?? (() => this.createDefaultIpcEndpoint());
    this.fileExists = options.fileExists ?? existsSync;
    this.isPackaged = options.isPackaged ?? process.env.NODE_ENV === 'production';
    this.maxConnectAttempts = options.maxConnectAttempts ?? 20;
    this.moduleDir = options.moduleDir ?? path.dirname(fileURLToPath(import.meta.url));
    this.onProgress = options.onProgress ?? (() => undefined);
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
    const args = [
      '--force-window=yes',
      `--input-ipc-server=${ipcServerPath}`,
      `--title=${input.title}`,
      `--start=${normalizeStartSeconds(input.startSeconds)}`,
      ...getProxyArgs(proxy),
      input.streamUrl,
    ];

    this.clearActiveSession();

    await new Promise<void>((resolve, reject) => {
      let child: SpawnedMpvProcess;
      let launchSettled = false;

      const settleLaunch = (settler: () => void) => {
        if (launchSettled) {
          return;
        }

        launchSettled = true;
        settler();
      };

      try {
        child = this.spawnProcess(executablePath, args, {
          stdio: 'ignore',
          windowsHide: true,
        });
      } catch (error) {
        reject(error);
        return;
      }

      const handleSpawn = () => {
        child.removeListener('error', handleError);
        child.once('exit', handleExit);
        this.startSession({
          sessionId,
          itemId: input.itemId,
          ipcServerPath,
          onFailure: (error) => {
            settleLaunch(() => reject(error));
          },
          onReady: () => {
            settleLaunch(resolve);
          },
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

        activeSession.onFailure(new Error('mpv exited before playback became ready.'));
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

    if (this.activeSession.retryTimeout) {
      clearTimeout(this.activeSession.retryTimeout);
    }

    if (this.activeSession.connectTimeout) {
      clearTimeout(this.activeSession.connectTimeout);
    }

    this.activeSession.client?.destroy();
    this.activeSession = null;
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
      session.isReady = true;
      if (session.connectTimeout) {
        clearTimeout(session.connectTimeout);
        session.connectTimeout = null;
      }
      session.onReady();
      this.observeProperty(client, 1, 'time-pos');
      this.observeProperty(client, 2, 'duration');
    });
    client.on('data', (chunk) => {
      this.handleIpcData(session.sessionId, chunk);
    });
    client.on('close', () => {
      if (this.isActiveSession(session.sessionId) && session.client === client) {
        if (!session.isReady) {
          session.onFailure(new Error('mpv closed before playback became ready.'));
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
        session.onFailure(new Error('Could not connect to mpv playback bridge.'));
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
          data?: unknown;
          event?: string;
          name?: string;
        };

        if (payload.event !== 'property-change') {
          continue;
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

  private observeProperty(
    client: MpvIpcClient,
    requestId: number,
    propertyName: 'duration' | 'time-pos'
  ): void {
    client.write(`${JSON.stringify({ command: ['observe_property', requestId, propertyName] })}\n`);
  }

  private startSession({
    ipcServerPath,
    itemId,
    onFailure,
    onReady,
    sessionId,
  }: {
    ipcServerPath: string;
    itemId: string;
    onFailure: (error: Error) => void;
    onReady: () => void;
    sessionId: number;
  }): void {
    const session: ActiveSession = {
      buffer: '',
      client: null,
      connectAttempt: 0,
      connectTimeout: null,
      durationSeconds: 0,
      ipcServerPath,
      isReady: false,
      itemId,
      onFailure,
      onReady,
      positionSeconds: null,
      retryTimeout: null,
      sessionId,
    };

    this.activeSession = session;
    session.connectTimeout = setTimeout(() => {
      if (!this.isActiveSession(session.sessionId) || session.isReady) {
        return;
      }

      session.onFailure(new Error('Timed out waiting for mpv to become ready.'));
      this.clearActiveSession();
    }, this.connectTimeoutMs);
    this.connectSession(session);
  }
}
