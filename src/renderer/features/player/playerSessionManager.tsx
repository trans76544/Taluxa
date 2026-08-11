import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PlayerPlaybackEvent } from '@shared/models/playback';
import type { PlayerEpisodeSelectEvent, PlayerProgressEvent } from '../../../electron/preload';
import { PlayerPage, type PlayerPageProps } from './PlayerPage';

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

export class PlayerSessionManager {
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
      const buffered = this.bufferedEvents.get(event.playerSessionId) ?? [];
      buffered.push(event);
      this.bufferedEvents.set(event.playerSessionId, buffered.slice(-32));
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

interface PlayerSessionHostValue {
  allocateLaunchId: () => number;
  registerSession: (record: PlayerSessionBridgeRecord) => void;
  removeSession: (key: string) => void;
}

const PlayerSessionHostContext = createContext<PlayerSessionHostValue | null>(null);

export function PlayerSessionHost({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<PlayerSessionBridgeRecord[]>([]);
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
  const removeSession = useCallback((key: string) => {
    setSessions((current) => current.filter((record) => record.key !== key));
  }, []);
  const value = useMemo(
    () => ({ allocateLaunchId, registerSession, removeSession }),
    [allocateLaunchId, registerSession, removeSession]
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
