import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PlayerPlaybackEvent } from '@shared/models/playback';
import type {
  PlayerLoadInput,
  PlayerOpenInput,
  PlayerOpenResult,
  PlayerRetryRequest,
  PlayerStartupFailureInput,
  PlayerStartupEvent,
} from '@shared/models/playerStartup';
import type { PlayerEpisodeSelectEvent, PlayerProgressEvent } from '../../../electron/preload';
import { PlayerPage, type PlayerPageProps } from './PlayerPage';
import { redactErrorMessage } from '@shared/network/redaction';

export type PlayerSessionEvent = PlayerPlaybackEvent | PlayerProgressEvent | PlayerEpisodeSelectEvent;

export interface PlayerSessionRecord {
  playerSessionId: number;
  itemId: string;
  onEvent?: (event: PlayerSessionEvent) => void;
}

export interface PlayerSessionBridgeRecord {
  key: string;
  props: PlayerPageProps;
}

export interface PlayerSessionStartupRequest extends PlayerOpenInput {
  key: string;
  prepare: () => Promise<PlayerSessionBridgeRecord>;
}

export class PlayerSessionManager {
  private static readonly MAX_BUFFERED_SESSIONS = 32;
  private static readonly MAX_BUFFERED_EVENTS_PER_SESSION = 32;
  private readonly records = new Map<number, PlayerSessionRecord>();
  private readonly bufferedEvents = new Map<number, PlayerSessionEvent[]>();

  register(record: PlayerSessionRecord): void {
    this.records.set(record.playerSessionId, record);
    const buffered = this.bufferedEvents.get(record.playerSessionId);
    if (!buffered) return;
    this.bufferedEvents.delete(record.playerSessionId);
    for (const event of buffered) record.onEvent?.(event);
  }

  update(playerSessionId: number, patch: Partial<Omit<PlayerSessionRecord, 'playerSessionId'>>): boolean {
    const current = this.records.get(playerSessionId);
    if (!current) return false;
    this.records.set(playerSessionId, { ...current, ...patch });
    return true;
  }

  dispatch(event: PlayerSessionEvent): void {
    const record = this.records.get(event.playerSessionId);
    if (!record) {
      if (!this.bufferedEvents.has(event.playerSessionId) &&
          this.bufferedEvents.size >= PlayerSessionManager.MAX_BUFFERED_SESSIONS) {
        const oldestSessionId = this.bufferedEvents.keys().next().value as number | undefined;
        if (oldestSessionId !== undefined) this.bufferedEvents.delete(oldestSessionId);
      }
      const buffered = this.bufferedEvents.get(event.playerSessionId) ?? [];
      buffered.push(event);
      this.bufferedEvents.set(
        event.playerSessionId,
        buffered.slice(-PlayerSessionManager.MAX_BUFFERED_EVENTS_PER_SESSION)
      );
      return;
    }
    record.onEvent?.(event);
  }

  get(playerSessionId: number): PlayerSessionRecord | undefined {
    return this.records.get(playerSessionId);
  }

  getAll(): PlayerSessionRecord[] {
    return [...this.records.values()];
  }

  remove(playerSessionId: number): boolean {
    this.bufferedEvents.delete(playerSessionId);
    return this.records.delete(playerSessionId);
  }
}

export type PlayerStartupRecordState =
  | 'opening-and-preparing'
  | 'surface-ready-and-preparing'
  | 'prepared-and-opening'
  | 'loading'
  | 'playing'
  | 'failed'
  | 'closed';

export type PreparedStartupMedia = Omit<
  PlayerLoadInput,
  'playerSessionId' | 'launchRequestId' | 'loadRequestId' | 'itemId' | 'title'
> & Record<string, unknown>;

export interface PlayerStartupRequest extends PlayerOpenInput {
  prepare: () => Promise<PreparedStartupMedia>;
}

export interface PlayerStartupRecord {
  launchRequestId: number;
  itemId: string;
  title: string;
  state: PlayerStartupRecordState;
  playerSessionId: number | null;
  loadRequestId: number;
  prepared: PreparedStartupMedia | null;
  ownerReleased: boolean;
  error: unknown | null;
}

interface PlayerStartupBridge {
  open(input: PlayerOpenInput): Promise<PlayerOpenResult>;
  load(input: PlayerLoadInput): Promise<void>;
  reportFailure?: (input: PlayerStartupFailureInput) => Promise<void>;
}

export class PlayerStartupCoordinator {
  private readonly records = new Map<number, PlayerStartupRecord>();
  private readonly requests = new Map<number, PlayerStartupRequest>();
  private readonly dispatchedLoads = new Set<string>();
  private readonly reportedFailures = new Set<string>();

  constructor(
    private readonly bridge: PlayerStartupBridge,
    private readonly onChange: (record: PlayerStartupRecord) => void = () => undefined
  ) {}

  start(request: PlayerStartupRequest): PlayerStartupRecord {
    const existing = this.records.get(request.launchRequestId);
    if (existing) return existing;
    const record: PlayerStartupRecord = {
      launchRequestId: request.launchRequestId,
      itemId: request.itemId,
      title: request.title,
      state: 'opening-and-preparing',
      playerSessionId: null,
      loadRequestId: 1,
      prepared: null,
      ownerReleased: false,
      error: null,
    };
    this.records.set(request.launchRequestId, record);
    this.requests.set(request.launchRequestId, request);
    this.onChange(record);

    const initialLoadRequestId = record.loadRequestId;
    void this.bridge.open({
      launchRequestId: request.launchRequestId,
      itemId: request.itemId,
      title: request.title,
      ...(request.episodeSelector ? { episodeSelector: request.episodeSelector } : {}),
    }).then((result) => {
      if (result.launchRequestId !== record.launchRequestId || !this.isActive(record)) return;
      record.playerSessionId = result.playerSessionId;
      if (record.state === 'failed') {
        this.onChange(record);
        this.reportFailure(record);
        return;
      }
      record.state = record.prepared ? 'loading' : 'surface-ready-and-preparing';
      this.onChange(record);
      void this.dispatchLoad(record);
    }).catch((error) => this.fail(record, error));

    void request.prepare()
      .then((prepared) => this.completePreparation(record, initialLoadRequestId, prepared))
      .catch((error) => {
        if (this.isActive(record) && record.loadRequestId === initialLoadRequestId) this.fail(record, error);
      });

    return record;
  }

  get(launchRequestId: number): PlayerStartupRecord | undefined {
    return this.records.get(launchRequestId);
  }

  releaseOwner(launchRequestId: number): boolean {
    const record = this.records.get(launchRequestId);
    if (!record) return false;
    record.ownerReleased = true;
    this.onChange(record);
    return true;
  }

  handleStartupEvent(event: PlayerStartupEvent): void {
    const record = this.records.get(event.launchRequestId);
    if (!record || (record.playerSessionId !== null && record.playerSessionId !== event.playerSessionId)) return;
    if (event.loadRequestId !== undefined && event.loadRequestId !== record.loadRequestId) return;
    if (event.phase === 'closed') {
      record.state = 'closed';
      this.onChange(record);
      this.records.delete(event.launchRequestId);
      this.requests.delete(event.launchRequestId);
      return;
    }
    if (event.phase === 'failed') {
      if (record.state === 'playing') return;
      record.state = 'failed';
      record.error = new Error(event.message ?? 'Unable to load this video.');
      this.onChange(record);
      return;
    }
    if (event.phase === 'first-frame') {
      record.state = 'playing';
      this.onChange(record);
    }
  }

  retry(event: PlayerRetryRequest): boolean {
    const record = this.records.get(event.launchRequestId);
    const request = this.requests.get(event.launchRequestId);
    if (!record || !request || record.playerSessionId !== event.playerSessionId ||
        record.itemId !== event.itemId || record.loadRequestId !== event.failedLoadRequestId ||
        record.state !== 'failed') return false;
    record.loadRequestId += 1;
    record.prepared = null;
    record.error = null;
    record.state = 'surface-ready-and-preparing';
    this.onChange(record);
    const retryLoadRequestId = record.loadRequestId;
    void request.prepare()
      .then((prepared) => this.completePreparation(record, retryLoadRequestId, prepared))
      .catch((error) => {
        if (this.isActive(record) && record.loadRequestId === retryLoadRequestId) this.fail(record, error);
      });
    return true;
  }

  private isActive(record: PlayerStartupRecord): boolean {
    return this.records.get(record.launchRequestId) === record && record.state !== 'closed';
  }

  private completePreparation(
    record: PlayerStartupRecord,
    loadRequestId: number,
    prepared: PreparedStartupMedia
  ): void {
    if (!this.isActive(record) || record.state === 'failed' || record.loadRequestId !== loadRequestId) return;
    record.prepared = prepared;
    record.state = record.playerSessionId ? 'loading' : 'prepared-and-opening';
    this.onChange(record);
    void this.dispatchLoad(record);
  }

  private async dispatchLoad(record: PlayerStartupRecord): Promise<void> {
    const dispatchKey = `${record.launchRequestId}:${record.loadRequestId}`;
    if (!this.isActive(record) || !record.playerSessionId || !record.prepared || this.dispatchedLoads.has(dispatchKey)) return;
    this.dispatchedLoads.add(dispatchKey);
    try {
      await this.bridge.load({
        ...record.prepared,
        playerSessionId: record.playerSessionId,
        launchRequestId: record.launchRequestId,
        loadRequestId: record.loadRequestId,
        itemId: record.itemId,
        title: record.title,
      });
    } catch (error) {
      this.fail(record, error);
    }
  }

  private fail(record: PlayerStartupRecord, error: unknown): void {
    record.error = error;
    record.state = 'failed';
    this.onChange(record);
    this.reportFailure(record);
  }

  private reportFailure(record: PlayerStartupRecord): void {
    if (!record.playerSessionId || !this.bridge.reportFailure) return;
    const failureKey = `${record.launchRequestId}:${record.loadRequestId}`;
    if (this.reportedFailures.has(failureKey)) return;
    this.reportedFailures.add(failureKey);
    void this.bridge.reportFailure({
      playerSessionId: record.playerSessionId,
      launchRequestId: record.launchRequestId,
      loadRequestId: record.loadRequestId,
      itemId: record.itemId,
      message: 'Unable to prepare this video.',
    }).catch(() => undefined);
  }
}

interface PlayerSessionHostValue {
  allocateLaunchId: () => number;
  registerSession: (record: PlayerSessionBridgeRecord) => void;
  startStartup: (request: PlayerSessionStartupRequest) => PlayerStartupRecord;
  removeSession: (key: string) => void;
}

const PlayerSessionHostContext = createContext<PlayerSessionHostValue | null>(null);

export function PlayerSessionHost({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<PlayerSessionBridgeRecord[]>([]);
  const preparedRecordsRef = useRef(new Map<number, PlayerSessionBridgeRecord>());
  const surfaceReadyNotifiedRef = useRef(new Set<number>());
  const [startupCoordinator] = useState(() => new PlayerStartupCoordinator(
    {
      open: (input) => window.embyDesktop.player.open(input),
      load: (input) => window.embyDesktop.player.load(input),
      reportFailure: (input) => window.embyDesktop.player.reportStartupFailure(input),
    },
    (record) => {
      const preparedRecord = preparedRecordsRef.current.get(record.launchRequestId);
      if (record.state === 'closed') {
        preparedRecordsRef.current.delete(record.launchRequestId);
        surfaceReadyNotifiedRef.current.delete(record.launchRequestId);
        if (preparedRecord) {
          setSessions((current) => current.filter((candidate) => candidate.key !== preparedRecord.key));
        }
        return;
      }
      if (record.state === 'failed' && preparedRecord) {
        preparedRecord.props.onLaunchFailure?.({
          itemId: record.itemId,
          launchRequestId: record.launchRequestId,
          message: record.error instanceof Error ? redactErrorMessage(record.error) : 'Unable to load this video.',
        });
      }
      if (!record.playerSessionId || !record.prepared || !preparedRecord) return;
      if (!surfaceReadyNotifiedRef.current.has(record.launchRequestId)) {
        surfaceReadyNotifiedRef.current.add(record.launchRequestId);
        preparedRecord.props.onLaunchReady?.({
          itemId: record.itemId,
          launchRequestId: record.launchRequestId,
          playerSessionId: record.playerSessionId,
        });
      }
      setSessions((current) => {
        const nextRecord = {
          ...preparedRecord,
          props: {
            ...preparedRecord.props,
            initialPlayerSessionId: record.playerSessionId ?? undefined,
            launchRequestId: record.launchRequestId,
          },
        };
        const index = current.findIndex((candidate) => candidate.key === nextRecord.key);
        if (index < 0) return [...current, nextRecord];
        const next = current.slice();
        next[index] = nextRecord;
        return next;
      });
    }
  ));
  useEffect(() => {
    const player = window.embyDesktop?.player;
    if (!player) return undefined;
    const unsubscribeStartup = player.onStartupEvent?.((event) => {
      startupCoordinator.handleStartupEvent(event);
    });
    const unsubscribeRetry = player.onRetryRequest?.((event) => {
      startupCoordinator.retry(event);
    });
    return () => {
      unsubscribeStartup?.();
      unsubscribeRetry?.();
    };
  }, [startupCoordinator]);
  const launchIdRef = useRef(0);
  const allocateLaunchId = useCallback(() => {
    launchIdRef.current += 1;
    return launchIdRef.current;
  }, []);
  const registerSession = useCallback((record: PlayerSessionBridgeRecord) => {
    setSessions((current) => {
      const index = current.findIndex((candidate) => candidate.key === record.key);
      if (index < 0) return [...current, record];
      const next = current.slice();
      next[index] = record;
      return next;
    });
  }, []);
  const startStartup = useCallback((request: PlayerSessionStartupRequest) => {
    return startupCoordinator.start({
      launchRequestId: request.launchRequestId,
      itemId: request.itemId,
      title: request.title,
      ...(request.episodeSelector ? { episodeSelector: request.episodeSelector } : {}),
      prepare: async () => {
        const preparedRecord = await request.prepare();
        preparedRecordsRef.current.set(request.launchRequestId, preparedRecord);
        const currentRecord = startupCoordinator.get(request.launchRequestId);
        if (currentRecord?.playerSessionId && !surfaceReadyNotifiedRef.current.has(request.launchRequestId)) {
          surfaceReadyNotifiedRef.current.add(request.launchRequestId);
          preparedRecord.props.onLaunchReady?.({
            itemId: currentRecord.itemId,
            launchRequestId: currentRecord.launchRequestId,
            playerSessionId: currentRecord.playerSessionId,
          });
        }
        if (currentRecord?.state === 'failed') {
          preparedRecord.props.onLaunchFailure?.({
            itemId: currentRecord.itemId,
            launchRequestId: currentRecord.launchRequestId,
            message: currentRecord.error instanceof Error
              ? redactErrorMessage(currentRecord.error)
              : 'Unable to load this video.',
          });
        }
        const props = preparedRecord.props;
        return {
          streamUrl: props.streamUrl,
          ...(props.authMode ? { authMode: props.authMode } : {}),
          ...(props.httpHeaders ? { httpHeaders: props.httpHeaders } : {}),
          ...(props.initialPositionSeconds !== undefined ? { startSeconds: props.initialPositionSeconds } : {}),
          ...(props.episodeSelector ? { episodeSelector: props.episodeSelector } : {}),
        };
      },
    });
  }, [startupCoordinator]);
  const removeSession = useCallback((key: string) => {
    setSessions((current) => current.filter((record) => record.key !== key));
  }, []);
  const value = useMemo(
    () => ({ allocateLaunchId, registerSession, startStartup, removeSession }),
    [allocateLaunchId, registerSession, startStartup, removeSession]
  );

  return (
    <PlayerSessionHostContext.Provider value={value}>
      {children}
      <div aria-hidden="true" data-testid="player-session-host" style={{ display: 'none' }}>
        {sessions.map((session) => <PlayerPage key={session.key} {...session.props} />)}
      </div>
    </PlayerSessionHostContext.Provider>
  );
}

export function usePlayerSessionHost(): PlayerSessionHostValue {
  const value = useContext(PlayerSessionHostContext);
  if (!value) throw new Error('usePlayerSessionHost must be used within PlayerSessionHost');
  return value;
}
