import { createEmbyRequest } from './client';
import { normalizeServerUrl } from '@shared/utils/normalizeServerUrl';
import type {
  LibraryEpisode,
  LibraryImageCandidate,
  LibraryItem,
  LibraryItemDetails,
  LibrarySeason,
  LibraryView,
} from '@shared/models/library';
import type { LibrarySortMode } from '@shared/models/settings';

interface EmbyLibraryViewPayload {
  Items?: Array<{
    Id?: string;
    Name?: string;
    CollectionType?: string;
  }>;
}

interface EmbyLibraryViewItem {
  Id: string;
  Name: string;
  CollectionType?: string | null;
}

interface EmbyLibraryItemPayload {
  Items?: Array<{
    Id?: string;
    Name?: string;
    Type?: string | null;
    SeriesId?: string | null;
    SeriesName?: string | null;
    ParentId?: string | null;
    ParentIndexNumber?: number | null;
    IndexNumber?: number | null;
    RunTimeTicks?: number | null;
    CommunityRating?: number | null;
    ProductionYear?: number | null;
    UserData?: {
      PlaybackPositionTicks?: number | null;
    };
  }>;
}

interface EmbyLibraryItem {
  Id: string;
  Name: string;
  Type?: string | null;
  SeriesId?: string | null;
  SeriesName?: string | null;
  ParentId?: string | null;
  ParentIndexNumber?: number | null;
  IndexNumber?: number | null;
  RunTimeTicks?: number | null;
  CommunityRating?: number | null;
  ProductionYear?: number | null;
  UserData?: {
    PlaybackPositionTicks?: number | null;
  };
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function buildImageUrl(serverUrl: string, itemId: string, imageType: 'Primary' | 'Thumb' | 'Backdrop'): string {
  const normalizedServerUrl = normalizeServerUrl(serverUrl);
  return `${normalizedServerUrl}/Items/${itemId}/Images/${imageType}`;
}

function buildExistingImageCandidates(
  serverUrl: string,
  item: { Id: string; ImageTags?: Record<string, string> | null; BackdropImageTags?: string[] | null }
): LibraryImageCandidate[] {
  const candidates: LibraryImageCandidate[] = [];

  if (item.ImageTags?.Thumb) {
    candidates.push({
      url: buildImageUrl(serverUrl, item.Id, 'Thumb'),
      kind: 'thumb',
    });
  }

  if (item.ImageTags?.Primary) {
    candidates.push({
      url: buildImageUrl(serverUrl, item.Id, 'Primary'),
      kind: 'primary',
    });
  }

  if (Array.isArray(item.BackdropImageTags) && item.BackdropImageTags.length > 0) {
    candidates.push({
      url: buildImageUrl(serverUrl, item.Id, 'Backdrop'),
      kind: 'backdrop',
    });
  }

  return candidates;
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function mapMediaSources(item: any) {
  return (item.MediaSources || []).map((m: any) => ({
    id: m.Id,
    path: m.Path,
    container: m.Container,
    size: typeof m.Size === 'number' ? m.Size : null,
    bitrate: typeof m.Bitrate === 'number' ? m.Bitrate : null,
    videoCodec: m.MediaStreams?.find((s: any) => s.Type === 'Video')?.Codec || m.VideoType || '',
    videoStream: m.MediaStreams?.find((s: any) => s.Type === 'Video') || null,
    audioStreams: m.MediaStreams?.filter((s: any) => s.Type === 'Audio') || []
  }));
}

export function mapViewsResponse(payload: EmbyLibraryViewPayload): LibraryView[] {
  return (payload.Items ?? []).reduce<LibraryView[]>((views, item) => {
    if (!hasText(item.Id) || !hasText(item.Name)) {
      return views;
    }

    views.push({
      id: item.Id.trim(),
      name: item.Name.trim(),
      collectionType: hasText(item.CollectionType) ? item.CollectionType.trim() : 'unknown',
    });

    return views;
  }, []);
}

export function mapItemsResponse(payload: EmbyLibraryItemPayload, serverUrl: string): LibraryItem[] {
  const normalizedServerUrl = normalizeServerUrl(serverUrl);

  return (payload.Items ?? [])
    .filter((item): item is EmbyLibraryItem => hasText(item.Id) && hasText(item.Name))
    .map((item) => {
      const itemId = item.Id.trim();
      const posterUrl = `${normalizedServerUrl}/Items/${itemId}/Images/Primary`;

      return {
        id: itemId,
        name: item.Name.trim(),
        ...(hasText(item.Type) ? { type: item.Type.trim() } : {}),
        ...(hasText(item.SeriesId) ? { seriesId: item.SeriesId.trim() } : {}),
        ...(hasText(item.SeriesName) ? { seriesName: item.SeriesName.trim() } : {}),
        ...(hasText(item.ParentId) ? { parentId: item.ParentId.trim() } : {}),
        ...(typeof item.ParentIndexNumber === 'number'
          ? { parentIndexNumber: item.ParentIndexNumber }
          : {}),
        ...(typeof item.IndexNumber === 'number' ? { indexNumber: item.IndexNumber } : {}),
        posterUrl,
        imageCandidates: [
          {
            url: buildImageUrl(normalizedServerUrl, itemId, 'Primary'),
            kind: 'primary',
          },
          {
            url: buildImageUrl(normalizedServerUrl, itemId, 'Thumb'),
            kind: 'thumb',
          },
          {
            url: buildImageUrl(normalizedServerUrl, itemId, 'Backdrop'),
            kind: 'backdrop',
          },
        ],
        runtimeTicks: typeof item.RunTimeTicks === 'number' ? item.RunTimeTicks : null,
        communityRating: typeof item.CommunityRating === 'number' ? item.CommunityRating : null,
        productionYear: typeof item.ProductionYear === 'number' ? item.ProductionYear : null,
        serverPositionTicks:
          typeof item.UserData?.PlaybackPositionTicks === 'number'
            ? item.UserData.PlaybackPositionTicks
            : null,
      };
    });
}

export async function fetchViews(
  serverUrl: string,
  userId: string,
  accessToken: string
): Promise<LibraryView[]> {
  const response = await createEmbyRequest(serverUrl, `/Users/${encodeURIComponent(userId)}/Views`, {
    accessToken,
  });

  if (!response.ok) {
    throw new Error(`Failed to load Emby libraries (${response.status})`);
  }

  return mapViewsResponse((await response.json()) as EmbyLibraryViewPayload);
}

export async function fetchItems(
  serverUrl: string,
  userId: string,
  parentId: string,
  accessToken: string,
  options: {
    limit?: number;
    sortMode?: LibrarySortMode;
  } = {}
): Promise<LibraryItem[]> {
  let SortBy = 'DateCreated,SortName';
  let SortOrder = 'Descending,Ascending';

  switch (options.sortMode) {
    case 'date_added':
    case 'latest_added':
      SortBy = 'DateCreated,SortName';
      SortOrder = 'Descending,Ascending';
      break;
    case 'sort_name':
      SortBy = 'SortName';
      SortOrder = 'Ascending';
      break;
    case 'community_rating':
      SortBy = 'CommunityRating,SortName';
      SortOrder = 'Descending,Ascending';
      break;
    case 'critic_rating':
      SortBy = 'CriticRating,SortName';
      SortOrder = 'Descending,Ascending';
      break;
    case 'production_year':
      SortBy = 'ProductionYear,PremiereDate,SortName';
      SortOrder = 'Descending,Descending,Ascending';
      break;
    case 'premiere_date':
    case 'release_date':
      SortBy = 'PremiereDate,ProductionYear,SortName';
      SortOrder = 'Descending,Descending,Ascending';
      break;
    case 'official_rating':
      SortBy = 'OfficialRating,SortName';
      SortOrder = 'Descending,Ascending';
      break;
    case 'date_played':
      SortBy = 'DatePlayed,SortName';
      SortOrder = 'Descending,Ascending';
      break;
    case 'runtime':
      SortBy = 'Runtime,SortName';
      SortOrder = 'Descending,Ascending';
      break;
  }

  const query = new URLSearchParams({
    ParentId: parentId,
    Recursive: 'true',
    IncludeItemTypes: 'Movie,Series',
    Fields: 'CommunityRating,ProductionYear',
    SortBy,
    SortOrder,
  });

  if (typeof options.limit === 'number') {
    query.set('Limit', String(options.limit));
  }

  const response = await createEmbyRequest(
    serverUrl,
    `/Users/${encodeURIComponent(userId)}/Items?${query.toString()}`,
    {
      accessToken,
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to load Emby library items (${response.status})`);
  }

  return mapItemsResponse((await response.json()) as EmbyLibraryItemPayload, serverUrl);
}

export async function fetchSearchItems(
  serverUrl: string,
  userId: string,
  searchTerm: string,
  accessToken: string
): Promise<LibraryItem[]> {
  const normalizedSearchTerm = normalizeSearchText(searchTerm);

  if (!normalizedSearchTerm) {
    return [];
  }

  const query = new URLSearchParams({
    SearchTerm: searchTerm.trim(),
    Recursive: 'true',
    IncludeItemTypes: 'Movie,Series',
    Fields: 'CommunityRating,ProductionYear',
    SortBy: 'SortName',
    SortOrder: 'Ascending',
  });

  const response = await createEmbyRequest(
    serverUrl,
    `/Users/${encodeURIComponent(userId)}/Items?${query.toString()}`,
    {
      accessToken,
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to search Emby items (${response.status})`);
  }

  const serverResults = mapItemsResponse((await response.json()) as EmbyLibraryItemPayload, serverUrl);

  if (serverResults.length > 0) {
    return serverResults;
  }

  const fallbackQuery = new URLSearchParams({
    Recursive: 'true',
    IncludeItemTypes: 'Movie,Series',
    Fields: 'CommunityRating,ProductionYear',
    SortBy: 'SortName',
    SortOrder: 'Ascending',
  });
  const fallbackResponse = await createEmbyRequest(
    serverUrl,
    `/Users/${encodeURIComponent(userId)}/Items?${fallbackQuery.toString()}`,
    {
      accessToken,
    }
  );

  if (!fallbackResponse.ok) {
    throw new Error(`Failed to load Emby items for search fallback (${fallbackResponse.status})`);
  }

  return mapItemsResponse((await fallbackResponse.json()) as EmbyLibraryItemPayload, serverUrl).filter((item) =>
    normalizeSearchText(item.name).includes(normalizedSearchTerm)
  );
}

export async function fetchItemsByIds(
  serverUrl: string,
  userId: string,
  itemIds: string[],
  accessToken: string
): Promise<LibraryItem[]> {
  if (itemIds.length === 0) {
    return [];
  }

  const ids = itemIds.map((itemId) => itemId.trim()).filter(Boolean).join(',');
  const query = new URLSearchParams({
    Ids: ids,
    EnableUserData: 'true',
    EnableImages: 'true',
    ImageTypeLimit: '1',
    Fields: 'ProductionYear,SeriesInfo',
  });
  const response = await createEmbyRequest(
    serverUrl,
    `/Users/${encodeURIComponent(userId)}/Items?${query.toString()}`,
    {
      accessToken,
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to load Emby items (${response.status})`);
  }

  return mapItemsResponse((await response.json()) as EmbyLibraryItemPayload, serverUrl);
}

export async function fetchItemDetails(
  serverUrl: string,
  userId: string,
  itemId: string,
  accessToken: string
): Promise<LibraryItemDetails> {
  const normalizedServerUrl = normalizeServerUrl(serverUrl);
  const response = await createEmbyRequest(
    serverUrl,
    `/Users/${encodeURIComponent(userId)}/Items/${itemId}?Fields=People,Studios,ExternalUrls,MediaSources,Overview,Genres,CommunityRating,OfficialRating,ProductionYear`,
    { accessToken }
  );

  if (!response.ok) {
    throw new Error(`Failed to load Emby item details (${response.status})`);
  }

  const item = await response.json() as any;

  return {
    id: item.Id,
    name: item.Name,
    type: item.Type,
    overview: item.Overview || '',
    genres: item.Genres || [],
    communityRating: item.CommunityRating || null,
    officialRating: item.OfficialRating || '',
    productionYear: item.ProductionYear || null,
    runtimeTicks: item.RunTimeTicks || null,
    serverPositionTicks: item.UserData?.PlaybackPositionTicks || null,
    posterUrl: `${normalizedServerUrl}/Items/${item.Id}/Images/Primary`,
    imageCandidates: [],
    backdropUrl: item.BackdropImageTags && item.BackdropImageTags.length > 0
      ? `${normalizedServerUrl}/Items/${item.Id}/Images/Backdrop`
      : null,
    people: (item.People || []).map((p: any) => ({
      id: p.Id,
      name: p.Name,
      role: p.Role || p.Type,
      imageUrl: p.PrimaryImageTag ? `${normalizedServerUrl}/Items/${p.Id}/Images/Primary` : null
    })),
    studios: (item.Studios || []).map((s: any) => ({
      id: s.Id,
      name: s.Name
    })),
    externalUrls: (item.ExternalUrls || []).map((e: any) => ({
      name: e.Name,
      url: e.Url
    })),
    mediaSources: mapMediaSources(item),
  };
}

export async function fetchSimilarItems(
  serverUrl: string,
  userId: string,
  itemId: string,
  accessToken: string,
  limit: number = 8
): Promise<LibraryItem[]> {
  const response = await createEmbyRequest(
    serverUrl,
    `/Items/${itemId}/Similar?UserId=${encodeURIComponent(userId)}&Limit=${limit}`,
    { accessToken }
  );

  if (!response.ok) {
    throw new Error(`Failed to load similar items (${response.status})`);
  }

  const payload = await response.json() as EmbyLibraryItemPayload;
  return mapItemsResponse(payload, serverUrl);
}

export async function fetchSeasons(
  serverUrl: string,
  userId: string,
  seriesId: string,
  accessToken: string
): Promise<LibrarySeason[]> {
  const normalizedServerUrl = normalizeServerUrl(serverUrl);
  const response = await createEmbyRequest(
    serverUrl,
    `/Shows/${seriesId}/Seasons?UserId=${encodeURIComponent(userId)}`,
    { accessToken }
  );

  if (!response.ok) {
    throw new Error(`Failed to load seasons (${response.status})`);
  }

  const payload = await response.json() as EmbyLibraryItemPayload;
  return (payload.Items || []).map((item: any) => ({
    id: item.Id,
    name: item.Name,
    indexNumber: item.IndexNumber,
    posterUrl: `${normalizedServerUrl}/Items/${item.Id}/Images/Primary`
  }));
}

export async function fetchEpisodes(
  serverUrl: string,
  userId: string,
  seriesId: string,
  seasonId: string,
  accessToken: string
): Promise<LibraryEpisode[]> {
  const normalizedServerUrl = normalizeServerUrl(serverUrl);
  const response = await createEmbyRequest(
    serverUrl,
    `/Shows/${seriesId}/Episodes?SeasonId=${seasonId}&UserId=${encodeURIComponent(userId)}&Fields=Overview,MediaSources`,
    { accessToken }
  );

  if (!response.ok) {
    throw new Error(`Failed to load episodes (${response.status})`);
  }

  const payload = await response.json() as EmbyLibraryItemPayload;
  return (payload.Items || []).map((item: any) => ({
    id: item.Id,
    name: item.Name,
    indexNumber: item.IndexNumber,
    parentIndexNumber: item.ParentIndexNumber,
    overview: item.Overview || '',
    runtimeTicks: item.RunTimeTicks || null,
    serverPositionTicks: item.UserData?.PlaybackPositionTicks || null,
    posterUrl: item.ImageTags?.Primary ? `${normalizedServerUrl}/Items/${item.Id}/Images/Primary` : null,
    imageCandidates: buildExistingImageCandidates(normalizedServerUrl, item),
    mediaSources: mapMediaSources(item),
  }));
}
