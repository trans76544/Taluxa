import type { HomeLibraryCard, HomePosterItem, HomePosterRow } from '@shared/api/emby/home';
import type {
  LibraryEpisode,
  LibraryItem,
  LibraryItemDetails,
  LibraryItemMediaSource,
  LibrarySeason,
} from '@shared/models/library';
import type { PersistedState } from '@shared/store/persistence';
import { vi } from 'vitest';

export function createHomePosterItem(overrides: Partial<HomePosterItem> = {}): HomePosterItem {
  return {
    id: 'item-1',
    title: 'Movie 1',
    subtitle: '2026',
    posterUrl: 'https://demo.local/items/item-1/primary.jpg',
    imageCandidates: [],
    href: '/item/item-1',
    ...overrides,
  };
}

export function createHomeLibraryCard(
  overrides: Partial<HomeLibraryCard> = {}
): HomeLibraryCard {
  return {
    id: 'library-1',
    title: 'Movies',
    posterUrl: 'https://demo.local/libraries/library-1/primary.jpg',
    imageCandidates: [],
    href: '/libraries/library-1',
    ...overrides,
  };
}

export function createHomePosterRow(overrides: Partial<HomePosterRow> = {}): HomePosterRow {
  return {
    id: 'row-1',
    title: 'Recently Added',
    href: '/libraries/library-1',
    items: [createHomePosterItem()],
    ...overrides,
  };
}

export function createLibraryItem(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'item-1',
    name: 'Movie 1',
    type: 'Movie',
    posterUrl: 'https://demo.local/items/item-1/primary.jpg',
    imageCandidates: [],
    runtimeTicks: 600000000,
    communityRating: 8,
    productionYear: 2026,
    serverPositionTicks: null,
    ...overrides,
  };
}

export function createLibraryItemDetails(
  overrides: Partial<LibraryItemDetails> = {}
): LibraryItemDetails {
  return {
    id: 'item-1',
    name: 'Movie 1',
    type: 'Movie',
    overview: 'A movie',
    genres: ['Drama'],
    communityRating: 8,
    officialRating: 'PG',
    productionYear: 2026,
    runtimeTicks: 600000000,
    serverPositionTicks: null,
    posterUrl: 'https://demo.local/items/item-1/primary.jpg',
    imageCandidates: [],
    backdropUrl: null,
    people: [],
    studios: [],
    externalUrls: [],
    mediaSources: [
      {
        id: 'source-1',
        path: 'movie.mp4',
        container: 'mp4',
        size: null,
        bitrate: null,
        videoCodec: 'h264',
        videoStream: null,
        audioStreams: [],
      },
    ],
    ...overrides,
  };
}

export function createDirectPlaybackMediaSource(
  overrides: Partial<LibraryItemMediaSource> = {}
): LibraryItemMediaSource {
  return {
    id: 'direct-source',
    path: 'movie.mp4',
    container: 'mp4',
    size: null,
    bitrate: null,
    videoCodec: 'h264',
    videoStream: null,
    audioStreams: [],
    ...overrides,
  };
}

export function createPlaybackInfoFallbackMediaSource(
  overrides: Partial<LibraryItemMediaSource> = {}
): LibraryItemMediaSource {
  return {
    id: 'playback-info-source',
    path: 'movie.mkv',
    container: 'mkv',
    size: null,
    bitrate: null,
    videoCodec: 'hevc',
    videoStream: null,
    audioStreams: [],
    ...overrides,
  };
}

export function createMovieDetails(
  overrides: Partial<LibraryItemDetails> = {}
): LibraryItemDetails {
  return createLibraryItemDetails({
    id: 'movie-1',
    name: 'Movie 1',
    type: 'Movie',
    mediaSources: [createDirectPlaybackMediaSource()],
    ...overrides,
  });
}

export function createSeriesDetails(
  overrides: Partial<LibraryItemDetails> = {}
): LibraryItemDetails {
  return createLibraryItemDetails({
    id: 'series-1',
    name: 'Series 1',
    type: 'Series',
    runtimeTicks: null,
    serverPositionTicks: null,
    mediaSources: [],
    ...overrides,
  });
}

export function createLibrarySeason(overrides: Partial<LibrarySeason> = {}): LibrarySeason {
  return {
    id: 'season-1',
    name: 'Season 1',
    indexNumber: 1,
    posterUrl: 'https://demo.local/items/season-1/primary.jpg',
    imageCandidates: [],
    ...overrides,
  };
}

export function createLibraryEpisode(overrides: Partial<LibraryEpisode> = {}): LibraryEpisode {
  return {
    id: 'episode-1',
    name: 'Episode 1',
    indexNumber: 1,
    parentIndexNumber: 1,
    overview: 'An episode',
    runtimeTicks: 600000000,
    serverPositionTicks: null,
    played: false,
    posterUrl: 'https://demo.local/items/episode-1/primary.jpg',
    imageCandidates: [],
    mediaSources: createLibraryItemDetails().mediaSources,
    ...overrides,
  };
}

export function createContinueWatchingPosterItem(
  overrides: Partial<HomePosterItem> = {}
): HomePosterItem {
  return createHomePosterItem({
    id: 'resume-movie-1',
    title: 'Resume Movie',
    subtitle: 'Continue',
    href: '/item/resume-movie-1',
    progressPercent: 25,
    state: {
      serverPositionTicks: 150000000,
      title: 'Resume Movie',
    },
    ...overrides,
  });
}

export function createControllablePlayerBridge() {
  const episodeSelectListeners = new Set<(itemId: string) => void>();
  return {
    launch: vi.fn().mockResolvedValue(undefined),
    onEpisodeSelect: vi.fn((listener: (itemId: string) => void) => {
      episodeSelectListeners.add(listener);
      return () => episodeSelectListeners.delete(listener);
    }),
    onProgress: vi.fn(() => () => undefined),
    preflight: vi.fn().mockResolvedValue(undefined),
    setStoryMarkers: vi.fn().mockResolvedValue(undefined),
    switchEpisode: vi.fn().mockResolvedValue(undefined),
    emitEpisodeSelect(itemId: string) {
      for (const listener of episodeSelectListeners) listener(itemId);
    },
  };
}

export function createPersistedState(overrides: Partial<PersistedState> = {}): PersistedState {
  return {
    accounts: [],
    activeAccountId: null,
    session: null,
    progressByItemId: {},
    homeCacheByKey: {},
    settings: undefined,
    ...overrides,
  } as PersistedState;
}
