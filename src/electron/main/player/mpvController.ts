import { spawn, type SpawnOptions } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface LaunchMpvInput {
  streamUrl: string;
  title: string;
  startSeconds?: number;
}

export interface SpawnedMpvProcess {
  once(event: 'error', listener: (error: Error) => void): this;
  once(event: 'spawn', listener: () => void): this;
  removeListener(event: 'error', listener: (error: Error) => void): this;
  removeListener(event: 'spawn', listener: () => void): this;
  unref(): void;
}

type SpawnProcess = (
  command: string,
  args: string[],
  options: SpawnOptions
) => SpawnedMpvProcess;

export interface MpvControllerOptions {
  isPackaged?: boolean;
  resourcesPath?: string;
  moduleDir?: string;
  fileExists?: (targetPath: string) => boolean;
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

export class MpvController {
  private readonly isPackaged: boolean;

  private readonly resourcesPath: string;

  private readonly moduleDir: string;

  private readonly fileExists: (targetPath: string) => boolean;

  private readonly spawnProcess: SpawnProcess;

  constructor(options: MpvControllerOptions = {}) {
    this.isPackaged = options.isPackaged ?? process.env.NODE_ENV === 'production';
    this.resourcesPath = options.resourcesPath ?? process.resourcesPath;
    this.moduleDir = options.moduleDir ?? path.dirname(fileURLToPath(import.meta.url));
    this.fileExists = options.fileExists ?? existsSync;
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

  async launch(input: LaunchMpvInput): Promise<void> {
    const executablePath = this.getExecutablePath();
    const args = [
      '--force-window=yes',
      `--title=${input.title}`,
      `--start=${normalizeStartSeconds(input.startSeconds)}`,
      input.streamUrl,
    ];

    await new Promise<void>((resolve, reject) => {
      let child: SpawnedMpvProcess;

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
        child.unref();
        resolve();
      };
      const handleError = (error: Error) => {
        child.removeListener('spawn', handleSpawn);
        reject(error);
      };

      child.once('spawn', handleSpawn);
      child.once('error', handleError);
    });
  }

  private getDevelopmentExecutablePath(): string {
    const workspaceRoot = findWorkspaceRoot(this.moduleDir, this.fileExists);

    if (!workspaceRoot) {
      throw new Error(`Unable to locate the workspace root from ${this.moduleDir}.`);
    }

    return path.join(workspaceRoot, 'vendor', 'mpv', 'windows-x64', 'mpv.exe');
  }
}
