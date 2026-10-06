import type { PlayerPlaybackEvent } from '@shared/models/playback';

export type NextEpisodePreloadState =
  | 'registered'
  | 'preparing'
  | 'ready'
  | 'failed'
  | 'released';

export interface NextEpisodePreloadRegistration<T> {
  playerSessionId: number;
  currentItemId: string;
  targetItemId: string;
  fingerprint: string;
  prepare: () => Promise<T>;
}

export interface NextEpisodePreloadConsumeInput {
  playerSessionId: number;
  currentItemId: string;
  targetItemId: string;
  fingerprint: string;
}

interface NextEpisodePreloadRecord<T> {
  registration: NextEpisodePreloadRegistration<T>;
  state: NextEpisodePreloadState;
  playbackId: string | null;
  preparation: Promise<T> | null;
  source: T | null;
}

export class NextEpisodePreloadCoordinator<T> {
  private readonly records = new Map<number, NextEpisodePreloadRecord<T>>();

  register(registration: NextEpisodePreloadRegistration<T>): void {
    this.releaseSession(registration.playerSessionId);
    this.records.set(registration.playerSessionId, {
      registration,
      state: 'registered',
      playbackId: null,
      preparation: null,
      source: null,
    });
  }

  handleEvent(event: PlayerPlaybackEvent): void {
    const record = this.records.get(event.playerSessionId);
    if (!record) return;

    if (event.phase === 'started') {
      if (event.itemId !== record.registration.currentItemId) {
        this.releaseSession(event.playerSessionId);
        return;
      }
      record.playbackId = event.playbackId;
      return;
    }

    if (event.phase === 'stopped') {
      if (event.reason !== 'eof' && event.itemId === record.registration.currentItemId &&
          (!record.playbackId || record.playbackId === event.playbackId)) {
        this.releaseSession(event.playerSessionId);
      }
      return;
    }

    if (event.itemId !== record.registration.currentItemId ||
        (record.playbackId !== null && record.playbackId !== event.playbackId)) {
      return;
    }

    record.playbackId ??= event.playbackId;
    if (event.durationSeconds <= 0 || event.positionSeconds / event.durationSeconds < 0.85 ||
        record.state !== 'registered') {
      return;
    }

    record.state = 'preparing';
    let preparation: Promise<T>;
    try {
      preparation = record.registration.prepare();
    } catch {
      record.state = 'failed';
      return;
    }
    record.preparation = preparation;
    void preparation.then(
      (source) => {
        if (this.records.get(event.playerSessionId) !== record || record.state !== 'preparing') return;
        record.source = source;
        record.state = 'ready';
      },
      () => {
        if (this.records.get(event.playerSessionId) !== record || record.state !== 'preparing') return;
        record.state = 'failed';
      }
    );
  }

  consume(input: NextEpisodePreloadConsumeInput): Promise<T> | null {
    const record = this.records.get(input.playerSessionId);
    if (!record || !this.matches(record, input)) return null;
    if (record.state === 'ready') return Promise.resolve(record.source as T);
    return record.state === 'preparing' ? record.preparation : null;
  }

  releaseSession(playerSessionId: number): void {
    const record = this.records.get(playerSessionId);
    if (!record) return;
    record.state = 'released';
    this.records.delete(playerSessionId);
  }

  getState(playerSessionId: number): NextEpisodePreloadState | undefined {
    return this.records.get(playerSessionId)?.state;
  }

  private matches(record: NextEpisodePreloadRecord<T>, input: NextEpisodePreloadConsumeInput): boolean {
    const { registration } = record;
    return registration.currentItemId === input.currentItemId &&
      registration.targetItemId === input.targetItemId &&
      registration.fingerprint === input.fingerprint;
  }
}
