import { createEmbyRequest } from './client';
import { normalizeServerUrl } from '@shared/utils/normalizeServerUrl';
import type { LibraryItem, LibraryView } from '@shared/models/library';

export type LibrarySortMode = 'latest_added' | 'release_date';

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
    RunTimeTicks?: number | null;
    UserData?: {
      PlaybackPositionTicks?: number | null;
    };
  }>;
}

interface EmbyLibraryItem {
  Id: string;
  Name: string;
  RunTimeTicks?: number | null;
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
  const query = new URLSearchParams({
    ParentId: parentId,
    Recursive: 'true',
    IncludeItemTypes: 'Movie,Episode',
    SortBy:
      options.sortMode === 'release_date'
        ? 'PremiereDate,ProductionYear,SortName'
        : 'DateCreated,SortName',
    SortOrder:
      options.sortMode === 'release_date'
        ? 'Descending,Descending,Ascending'
        : 'Descending,Ascending',
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
  const response = await createEmbyRequest(
    serverUrl,
    `/Users/${encodeURIComponent(userId)}/Items?Ids=${encodeURIComponent(ids)}&EnableUserData=true&EnableImages=true&ImageTypeLimit=1`,
    {
      accessToken,
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to load Emby items (${response.status})`);
  }

  return mapItemsResponse((await response.json()) as EmbyLibraryItemPayload, serverUrl);
}
