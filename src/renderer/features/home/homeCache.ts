import type { HomeLibraryCard, HomePosterItem, HomePosterRow } from '@shared/api/emby/home';
import type { DataCacheTtlDays, LibrarySortMode } from '@shared/models/settings';
import type { PersistedHomeCacheEntry } from '@shared/store/persistence';

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

export function isHomeCacheFresh(
  cachedAt: string,
  nowMs = Date.now(),
  ttlDays: DataCacheTtlDays = 30
): boolean {
  const cachedAtMs = Date.parse(cachedAt);

  if (!Number.isFinite(cachedAtMs)) {
    return false;
  }

  const ageMs = nowMs - cachedAtMs;

  if (ageMs < 0) {
    return false;
  }

  if (ttlDays === null) {
    return true;
  }

  return ageMs <= ttlDays * 24 * 60 * 60 * 1000;
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

export function createHomeCacheFallbackStatusMessage(): string {
  return 'Could not refresh home data. Showing saved content.';
}

export function isCompleteHomeCacheEntry(
  cacheEntry: PersistedHomeCacheEntry | undefined
): cacheEntry is PersistedHomeCacheEntry {
  const cachedAtMs =
    typeof cacheEntry?.cachedAt === 'string' ? Date.parse(cacheEntry.cachedAt) : Number.NaN;
  const hasPrimaryContent =
    Array.isArray(cacheEntry?.continueWatching) && cacheEntry.continueWatching.length > 0 ||
    Array.isArray(cacheEntry?.libraries) && cacheEntry.libraries.length > 0 ||
    Array.isArray(cacheEntry?.featuredRows) &&
      cacheEntry.featuredRows.some((row) => Array.isArray(row.items) && row.items.length > 0);

  return Boolean(
    cacheEntry &&
      typeof cacheEntry.accountLabel === 'string' &&
      cacheEntry.accountLabel.trim().length > 0 &&
      Number.isFinite(cachedAtMs) &&
      Array.isArray(cacheEntry.continueWatching) &&
      Array.isArray(cacheEntry.libraries) &&
      Array.isArray(cacheEntry.featuredRows) &&
      hasPrimaryContent
  );
}
