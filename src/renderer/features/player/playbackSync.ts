import type { SavedAccount } from '@shared/models/session';
import type { PlaybackResumeItemSnapshot, PlaybackProgress } from '@shared/models/progress';
import type { PlayerPlaybackEvent } from '@shared/models/playback';
import type { PlaybackMethod, ReportPlaybackProgressInput } from '@shared/api/emby/playback';
import { createAccountScopedProgressKey, getPersistedProgressByItemIdForAccount, type PersistedState, type PersistedStatePatch } from '@shared/store/persistence';
import { createConfirmedProgressUpdate, createFailedProgressUpdate, isSameProgressRevision } from '@shared/utils/playbackProgress';

export interface PlaybackReportContext {
  accountId: string; serverUrl: string; userId: string; accessToken: string; itemId: string;
  playSessionId: string | null; mediaSourceId: string | null; playMethod: PlaybackMethod;
  audioStreamIndex: number | null; resumeItem: PlaybackResumeItemSnapshot;
}

interface Dependencies {
  readState: () => Promise<PersistedState>;
  writeState: (patch: PersistedStatePatch) => Promise<PersistedState>;
  reportStarted: (input: ReportPlaybackProgressInput) => Promise<void>;
  reportProgress: (input: ReportPlaybackProgressInput) => Promise<void>;
  reportStopped: (input: ReportPlaybackProgressInput) => Promise<void>;
  now?: () => Date;
}

interface LiveState {
  hasStarted: boolean;
  stopped: boolean;
  remoteStarted: boolean;
  lastSequence: number;
  lastReportedAt: number | null;
  lastReportedPosition: number | null;
}

export class PlaybackSyncCoordinator {
  private readonly contexts = new Map<string, PlaybackReportContext>();
  private readonly live = new Map<string, LiveState>();
  private queue: Promise<void> = Promise.resolve();
  private localQueue: Promise<void> = Promise.resolve();
  private readonly now: () => Date;
  constructor(private readonly dependencies: Dependencies) { this.now = dependencies.now ?? (() => new Date()); }

  registerContext(context: PlaybackReportContext): void { this.contexts.set(context.itemId, context); }
  unregisterContext(itemId: string): void { this.contexts.delete(itemId); }

  async handleEvent(event: PlayerPlaybackEvent): Promise<void> {
    const context = this.contexts.get(event.itemId);
    if (!context) return;
    const state = this.live.get(event.playbackId) ?? {
      hasStarted: false, stopped: false, remoteStarted: false,
      lastSequence: -1, lastReportedAt: null, lastReportedPosition: null,
    };
    if (event.sequence <= state.lastSequence || state.stopped) return;
    if (event.phase === 'started') {
      if (state.hasStarted) return;
      state.hasStarted = true;
    } else if (!state.hasStarted) {
      return;
    }
    state.lastSequence = event.sequence;
    if (event.phase === 'stopped') state.stopped = true;
    this.live.set(event.playbackId, state);

    if (event.phase === 'started') {
      this.queue = this.queue.then(() => this.processRemote(context, event, state, null)).catch(() => undefined);
      await this.queue;
      return;
    }
    if (event.positionSeconds <= 0 && event.phase !== 'stopped') return;

    const progress = event.positionSeconds > 0 ? this.createProgress(context, event) : null;
    const localWrite = progress
      ? this.localQueue = this.localQueue.then(async () => {
          const key = createAccountScopedProgressKey(context.accountId, event.itemId);
          await this.dependencies.writeState({ clearHomeCache: true, progressByItemId: { [key]: progress } });
        }).catch(() => undefined)
      : Promise.resolve();
    this.queue = this.queue
      .then(() => localWrite)
      .then(() => this.processRemote(context, event, state, progress))
      .catch(() => undefined);
    await this.queue;
  }

  private input(context: PlaybackReportContext, event: PlayerPlaybackEvent): ReportPlaybackProgressInput {
    return { serverUrl: context.serverUrl, accessToken: context.accessToken, itemId: event.itemId,
      positionSeconds: event.positionSeconds, durationSeconds: event.durationSeconds,
      playSessionId: context.playSessionId, mediaSourceId: context.mediaSourceId,
      playMethod: context.playMethod, audioStreamIndex: context.audioStreamIndex };
  }

  private async ensureStarted(context: PlaybackReportContext, event: PlayerPlaybackEvent, state: LiveState): Promise<void> {
    if (state.remoteStarted) return;
    await this.dependencies.reportStarted(this.input(context, event));
    state.remoteStarted = true;
  }

  private createProgress(context: PlaybackReportContext, event: Exclude<PlayerPlaybackEvent, { phase: 'started' }>): PlaybackProgress {
    return {
      itemId: event.itemId, playbackId: event.playbackId, sequence: event.sequence,
      positionSeconds: Math.max(0, Math.floor(event.positionSeconds)), durationSeconds: Math.max(0, Math.floor(event.durationSeconds)),
      updatedAt: this.now().toISOString(), resumeItem: context.resumeItem,
      pendingOperation: event.phase === 'stopped' ? 'stopped' : 'progress',
      completed: event.phase === 'stopped' ? event.completed : false,
      playSessionId: context.playSessionId ?? undefined, mediaSourceId: context.mediaSourceId ?? undefined,
      playMethod: context.playMethod, audioStreamIndex: context.audioStreamIndex ?? undefined,
      serverStatus: 'pending', retryCount: 0, final: event.phase === 'stopped',
    };
  }

  private async processRemote(
    context: PlaybackReportContext,
    event: PlayerPlaybackEvent,
    state: LiveState,
    progress: PlaybackProgress | null,
  ): Promise<void> {
    if (event.phase === 'started') {
      try { await this.ensureStarted(context, event, state); } catch { /* retry on next event */ }
      return;
    }
    if (event.phase === 'progress') {
      const position = Math.floor(event.positionSeconds);
      if (state.lastReportedPosition === position) return;
      if (state.lastReportedAt !== null && this.now().getTime() - state.lastReportedAt < 10_000) return;
      state.lastReportedAt = this.now().getTime();
      state.lastReportedPosition = position;
    }
    const key = createAccountScopedProgressKey(context.accountId, event.itemId);
    try {
      await this.ensureStarted(context, event, state);
      if (event.phase === 'stopped') await this.dependencies.reportStopped(this.input(context, event));
      else await this.dependencies.reportProgress(this.input(context, event));
      if (progress) await this.writeStatusIfCurrent(context.accountId, key, progress, true);
    } catch (error) {
      if (progress) await this.writeStatusIfCurrent(context.accountId, key, progress, false, error);
    }
  }

  private async writeStatusIfCurrent(accountId: string, key: string, progress: PlaybackProgress, success: boolean, error?: unknown): Promise<void> {
    const persisted = await this.dependencies.readState();
    const current = getPersistedProgressByItemIdForAccount(persisted.progressByItemId, accountId)[progress.itemId];
    const isCurrent = progress.playbackId
      ? isSameProgressRevision(current, { playbackId: progress.playbackId, sequence: progress.sequence ?? 0 })
      : current?.updatedAt === progress.updatedAt
        && current.positionSeconds === progress.positionSeconds
        && current.serverStatus === progress.serverStatus;
    if (!isCurrent) return;
    const next = success ? createConfirmedProgressUpdate(progress, this.now().toISOString()) : createFailedProgressUpdate(progress, error, this.now().toISOString());
    await this.dependencies.writeState({ progressByItemId: { [key]: next } });
  }

  async retryPendingForAccount(account: SavedAccount): Promise<void> {
    const persisted = await this.dependencies.readState();
    const records = getPersistedProgressByItemIdForAccount(persisted.progressByItemId, account.id);
    for (const progress of Object.values(records)) {
      if (progress.serverStatus === 'confirmed' || progress.positionSeconds <= 0) continue;
      const key = createAccountScopedProgressKey(account.id, progress.itemId);
      try {
        await this.dependencies.reportStopped({ serverUrl: account.serverUrl, accessToken: account.accessToken,
          itemId: progress.itemId, positionSeconds: progress.positionSeconds, durationSeconds: progress.durationSeconds,
          playSessionId: progress.playSessionId, mediaSourceId: progress.mediaSourceId, playMethod: progress.playMethod ?? 'DirectPlay', audioStreamIndex: progress.audioStreamIndex });
        await this.writeStatusIfCurrent(account.id, key, progress, true);
      } catch (error) {
        await this.writeStatusIfCurrent(account.id, key, progress, false, error);
      }
    }
  }
}
