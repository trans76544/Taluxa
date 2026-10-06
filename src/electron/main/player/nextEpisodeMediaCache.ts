import type { PlayerPlaybackEvent } from '@shared/models/playback';
import type { NextEpisodeMediaPreloadInput } from '@shared/models/mediaPreload';
import { MediaPreloadProxy, type MediaPreloadLease } from './mediaPreloadProxy';

interface Candidate { input: NextEpisodeMediaPreloadInput; lease: MediaPreloadLease | null; expires: number; timer: ReturnType<typeof setTimeout> }
interface Selection { playerSessionId: number; itemId: string; streamUrl: string; httpHeaders?: Record<string, string>; startSeconds?: number }
function sourceKey(input: Selection): string {
  return JSON.stringify([input.itemId, input.streamUrl, Object.entries(input.httpHeaders ?? {}).sort(([a], [b]) => a.localeCompare(b))]);
}

/** Keeps prefetch ownership separate from the proxy currently used by the playing episode. */
export class NextEpisodeMediaCache {
  private readonly currentItems = new Map<number, string>();
  private readonly candidates = new Map<number, Candidate>();
  private readonly active = new Map<number, { itemId: string; streamUrl: string }[]>();
  constructor(private readonly proxy: MediaPreloadProxy, private readonly ttlMs = 5 * 60_000) {}

  handlePlaybackEvent(event: PlayerPlaybackEvent): void {
    if (event.phase === 'stopped') {
      if (this.currentItems.get(event.playerSessionId) === event.itemId && event.reason !== 'eof') this.releaseCandidate(event.playerSessionId);
      return;
    }
    this.currentItems.set(event.playerSessionId, event.itemId);
    const candidate = this.candidates.get(event.playerSessionId);
    if (candidate && candidate.input.currentItemId !== event.itemId) this.releaseCandidate(event.playerSessionId);
    else if (candidate) {
      candidate.expires = Date.now() + this.ttlMs;
      candidate.timer.refresh();
    }
    if (event.phase === 'started') {
      const active = this.active.get(event.playerSessionId) ?? [];
      for (const lease of active) if (lease.itemId !== event.itemId) this.proxy.release(lease.streamUrl);
      this.active.set(event.playerSessionId, active.filter(lease => lease.itemId === event.itemId));
    }
  }

  async prefetch(input: NextEpisodeMediaPreloadInput): Promise<void> {
    if (this.currentItems.get(input.playerSessionId) !== input.currentItemId) return;
    const previous = this.candidates.get(input.playerSessionId);
    if (previous && previous.input.currentItemId === input.currentItemId && sourceKey(previous.input) === sourceKey(input)) return;
    this.releaseCandidate(input.playerSessionId);
    const candidate: Candidate = {
      input: { ...input, httpHeaders: { ...input.httpHeaders } }, lease: null,
      expires: Date.now() + this.ttlMs,
      timer: setTimeout(() => {
        if (this.candidates.get(input.playerSessionId) === candidate) this.releaseCandidate(input.playerSessionId);
      }, this.ttlMs),
    };
    candidate.timer.unref();
    this.candidates.set(input.playerSessionId, candidate);
    try {
      const lease = await this.proxy.create(input);
      if (this.candidates.get(input.playerSessionId) !== candidate) { this.proxy.release(lease.streamUrl); return; }
      candidate.lease = lease;
      // IPC acknowledges scheduling rather than delaying a next click for a full prefetch.
      void lease.ready.catch(() => {
        if (this.candidates.get(input.playerSessionId) === candidate && !this.proxy.hasData(lease.streamUrl)) this.releaseCandidate(input.playerSessionId);
      });
    } catch {
      if (this.candidates.get(input.playerSessionId) === candidate) this.releaseCandidate(input.playerSessionId);
    }
  }

  consume(input: Selection): string | null {
    const candidate = this.candidates.get(input.playerSessionId);
    if (!candidate) return null;
    if (candidate.expires < Date.now() || sourceKey(candidate.input) !== sourceKey(input) ||
        this.currentItems.get(input.playerSessionId) !== candidate.input.currentItemId ||
        !candidate.lease || !this.proxy.hasData(candidate.lease.streamUrl)) {
      this.releaseCandidate(input.playerSessionId); return null;
    }
    clearTimeout(candidate.timer);
    this.candidates.delete(input.playerSessionId);
    this.active.set(input.playerSessionId, [
      ...(this.active.get(input.playerSessionId) ?? []),
      { itemId: input.itemId, streamUrl: candidate.lease.streamUrl },
    ]);
    return candidate.lease.streamUrl;
  }

  releaseSession(playerSessionId: number): void {
    this.releaseCandidate(playerSessionId);
    this.releaseActive(playerSessionId);
    this.currentItems.delete(playerSessionId);
  }
  close(): void {
    for (const candidate of this.candidates.values()) clearTimeout(candidate.timer);
    this.candidates.clear(); this.active.clear(); this.currentItems.clear(); this.proxy.close();
  }
  private releaseCandidate(playerSessionId: number): void {
    const candidate = this.candidates.get(playerSessionId);
    if (!candidate) return;
    clearTimeout(candidate.timer);
    this.candidates.delete(playerSessionId);
    if (candidate.lease) this.proxy.release(candidate.lease.streamUrl);
  }
  private releaseActive(playerSessionId: number): void {
    const active = this.active.get(playerSessionId);
    if (!active) return;
    this.active.delete(playerSessionId);
    for (const lease of active) this.proxy.release(lease.streamUrl);
  }
}
