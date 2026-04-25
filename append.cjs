const fs = require('fs');

const appendCode = `

export async function fetchItemDetails(
  serverUrl: string,
  userId: string,
  itemId: string,
  accessToken: string
): Promise<LibraryItemDetails> {
  const normalizedServerUrl = normalizeServerUrl(serverUrl);
  const response = await createEmbyRequest(
    serverUrl,
    \`/Users/\${encodeURIComponent(userId)}/Items/\${itemId}?Fields=People,Studios,ExternalUrls,MediaSources,Overview,Genres,CommunityRating,OfficialRating,ProductionYear\`,
    { accessToken }
  );

  if (!response.ok) {
    throw new Error(\`Failed to load Emby item details (\${response.status})\`);
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
    posterUrl: \`\${normalizedServerUrl}/Items/\${item.Id}/Images/Primary\`,
    backdropUrl: item.BackdropImageTags && item.BackdropImageTags.length > 0
      ? \`\${normalizedServerUrl}/Items/\${item.Id}/Images/Backdrop\`
      : null,
    people: (item.People || []).map((p: any) => ({
      id: p.Id,
      name: p.Name,
      role: p.Role || p.Type,
      imageUrl: p.PrimaryImageTag ? \`\${normalizedServerUrl}/Items/\${p.Id}/Images/Primary\` : null
    })),
    studios: (item.Studios || []).map((s: any) => ({
      id: s.Id,
      name: s.Name
    })),
    externalUrls: (item.ExternalUrls || []).map((e: any) => ({
      name: e.Name,
      url: e.Url
    })),
    mediaSources: (item.MediaSources || []).map((m: any) => ({
      id: m.Id,
      path: m.Path,
      container: m.Container,
      size: m.Size,
      bitrate: m.Bitrate,
      videoCodec: m.VideoType,
      videoStream: m.MediaStreams?.find((s: any) => s.Type === 'Video') || null,
      audioStreams: m.MediaStreams?.filter((s: any) => s.Type === 'Audio') || []
    })),
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
    \`/Items/\${itemId}/Similar?UserId=\${encodeURIComponent(userId)}&Limit=\${limit}\`,
    { accessToken }
  );

  if (!response.ok) {
    throw new Error(\`Failed to load similar items (\${response.status})\`);
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
    \`/Shows/\${seriesId}/Seasons?UserId=\${encodeURIComponent(userId)}\`,
    { accessToken }
  );

  if (!response.ok) {
    throw new Error(\`Failed to load seasons (\${response.status})\`);
  }

  const payload = await response.json() as EmbyLibraryItemPayload;
  return (payload.Items || []).map((item: any) => ({
    id: item.Id,
    name: item.Name,
    indexNumber: item.IndexNumber,
    posterUrl: \`\${normalizedServerUrl}/Items/\${item.Id}/Images/Primary\`
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
    \`/Shows/\${seriesId}/Episodes?SeasonId=\${seasonId}&UserId=\${encodeURIComponent(userId)}&Fields=Overview\`,
    { accessToken }
  );

  if (!response.ok) {
    throw new Error(\`Failed to load episodes (\${response.status})\`);
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
    posterUrl: item.ImageTags?.Primary ? \`\${normalizedServerUrl}/Items/\${item.Id}/Images/Primary\` : null
  }));
}
\`;

fs.appendFileSync('src/shared/api/emby/library.ts', appendCode);
