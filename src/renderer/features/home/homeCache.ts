import type { HomeLibraryCard, HomePosterItem, HomePosterRow } from '@shared/api/emby/home';
import type { LibrarySortMode } from '@shared/models/settings';
import type { PersistedHomeCacheEntry } from '@shared/store/persistence';

export const HOME_CACHE_TTL_MS = 10 * 60 * 1000;

interface CreateHomeCacheEntryArgs {
  accountLabel: string;
  continueWatching: HomePosterItem[];
  libraries: HomeLibraryCard[];
  featuredRows: HomePosterRow[];
  now: number;
}

export function createHomeCacheKey(accountId: string, sortMode: LibrarySortMode): string {
  return `home-cache::${accountId}::${sortMode}`;
}

export function isHomeCacheFresh(cachedAt: string, nowMs = Date.now()): boolean {
  const cachedAtMs = Date.parse(cachedAt);

  if (!Number.isFinite(cachedAtMs)) {
    return false;
  }

  const ageMs = nowMs - cachedAtMs;

  return ageMs >= 0 && ageMs <= HOME_CACHE_TTL_MS;
}

export function createHomeCacheEntry({
  accountLabel,
  continueWatching,
  libraries,
  featuredRows,
  now,
}: CreateHomeCacheEntryArgs): PersistedHomeCacheEntry {
  return {
    cachedAt: new Date(now).toISOString(),
    accountLabel,
    continueWatching,
    libraries,
    featuredRows,
  };
}
