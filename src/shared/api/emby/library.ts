import { createEmbyRequest } from './client';
import { normalizeServerUrl } from '@shared/utils/normalizeServerUrl';
import type { LibraryItem, LibraryView } from '@shared/models/library';

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
  CollectionType: string;
}

interface EmbyLibraryItemPayload {
  Items?: Array<{
    Id?: string;
    Name?: string;
    RunTimeTicks?: number | null;
  }>;
}

interface EmbyLibraryItem {
  Id: string;
  Name: string;
  RunTimeTicks?: number | null;
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function mapViewsResponse(payload: EmbyLibraryViewPayload): LibraryView[] {
  return (payload.Items ?? [])
    .filter((item): item is EmbyLibraryViewItem =>
      hasText(item.Id) && hasText(item.Name) && hasText(item.CollectionType)
    )
    .map((item) => ({
      id: item.Id.trim(),
      name: item.Name.trim(),
      collectionType: item.CollectionType.trim(),
    }));
}

function mapItemsResponse(payload: EmbyLibraryItemPayload, serverUrl: string): LibraryItem[] {
  const normalizedServerUrl = normalizeServerUrl(serverUrl);

  return (payload.Items ?? [])
    .filter((item): item is EmbyLibraryItem => hasText(item.Id) && hasText(item.Name)
    )
    .map((item) => ({
      id: item.Id.trim(),
      name: item.Name.trim(),
      posterUrl: `${normalizedServerUrl}/Items/${item.Id.trim()}/Images/Primary`,
      runtimeTicks: typeof item.RunTimeTicks === 'number' ? item.RunTimeTicks : null,
    }));
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
  accessToken: string
): Promise<LibraryItem[]> {
  const response = await createEmbyRequest(
    serverUrl,
    `/Users/${encodeURIComponent(userId)}/Items?ParentId=${encodeURIComponent(parentId)}&Recursive=true&IncludeItemTypes=Movie,Episode`,
    {
      accessToken,
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to load Emby library items (${response.status})`);
  }

  return mapItemsResponse((await response.json()) as EmbyLibraryItemPayload, serverUrl);
}
