const fs = require('fs');
let lines = fs.readFileSync('src/renderer/app/router.tsx', 'utf8').split('\n');

// imports
for(let i=0; i<30; i++) {
  if (lines[i].includes("import { fetchItems, fetchItemsByIds, fetchViews } from '@shared/api/emby/library';")) {
    lines[i] = "import { fetchItems, fetchItemsByIds, fetchViews, fetchItemDetails, fetchSimilarItems, fetchSeasons, fetchEpisodes } from '@shared/api/emby/library';";
  }
  if (lines[i].includes("import type { LibraryItem } from '@shared/models/library';")) {
    lines[i] = "import type { LibraryItem, LibraryItemDetails, LibrarySeason, LibraryEpisode } from '@shared/models/library';";
  }
  if (lines[i].includes("import { PlayerPage } from '@renderer/features/player/PlayerPage';")) {
    lines[i] += "\nimport { ItemDetailsPage } from '@renderer/features/library/ItemDetailsPage';";
  }
}

// routes
for(let i=100; i<120; i++) {
  if (lines[i].includes("function PlayerGate() {")) {
    lines[i] = "function ItemDetailsGate() {";
  }
  if (lines[i].includes("return session ? <PlayerRoute /> : <Navigate to=\"/login\" replace />;")) {
    lines[i] = "  return session ? <ItemDetailsRoute /> : <Navigate to=\"/login\" replace />;";
  }
}

for(let i=lines.length - 20; i<lines.length; i++) {
  if (lines[i] && lines[i].includes("<Route path=\"/player/:itemId\" element={<PlayerGate />} />")) {
    lines[i] = "      <Route path=\"/item/:itemId\" element={<ItemDetailsGate />} />";
  }
}

const content = lines.join('\n');
const startIdx = content.indexOf('function PlayerRoute() {');
const endIdx = content.indexOf('function LoginRoute() {');

const newComponents = `function ItemDetailsRoute() {
  const { activeAccountId, serverUrl, session } = useAuth();
  const { itemId = '' } = useParams();
  const location = useLocation();

  const [details, setDetails] = useState<LibraryItemDetails | null>(null);
  const [similarItems, setSimilarItems] = useState<LibraryItem[]>([]);
  const [seasons, setSeasons] = useState<LibrarySeason[]>([]);
  const [episodes, setEpisodes] = useState<LibraryEpisode[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const [playbackSource, setPlaybackSource] = useState<PlaybackStreamSource | null>(null);
  const [playbackItemId, setPlaybackItemId] = useState('');
  const [initialPositionSeconds, setInitialPositionSeconds] = useState<number | null>(null);
  const [playbackErrorMessage, setPlaybackErrorMessage] = useState('');

  const resolvedActiveAccountId = activeAccountId ?? (session ? createAccountId(serverUrl, session.userId) : null);
  const progressStateRef = useRef<{ lastReportedAtMs: number | null; lastReportedPositionSeconds: number | null }>({ lastReportedAtMs: null, lastReportedPositionSeconds: null });
  const progressSyncQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    progressStateRef.current = { lastReportedAtMs: null, lastReportedPositionSeconds: null };
    progressSyncQueueRef.current = Promise.resolve();
  }, [playbackItemId, resolvedActiveAccountId]);

  useEffect(() => {
    const currentSession = session;
    if (!currentSession || !itemId) return;
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage('');
    
    setPlaybackSource(null);
    setPlaybackItemId('');
    setPlaybackErrorMessage('');

    async function loadData() {
      try {
        const itemDetails = await fetchItemDetails(serverUrl, currentSession.userId, itemId, currentSession.accessToken);
        if (cancelled) return;
        setDetails(itemDetails);

        const similar = await fetchSimilarItems(serverUrl, currentSession.userId, itemId, currentSession.accessToken, 8).catch(() => []);
        if (cancelled) return;
        setSimilarItems(similar);

        if (itemDetails.type === 'Series') {
          const seasonsList = await fetchSeasons(serverUrl, currentSession.userId, itemId, currentSession.accessToken).catch(() => []);
          if (cancelled) return;
          setSeasons(seasonsList);
          
          if (seasonsList.length > 0) {
            const firstSeason = seasonsList[0].id;
            setSelectedSeasonId(firstSeason);
            const episodesList = await fetchEpisodes(serverUrl, currentSession.userId, itemId, firstSeason, currentSession.accessToken).catch(() => []);
            if (cancelled) return;
            setEpisodes(episodesList);
          }
        }
        setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          setErrorMessage('Could not load item details.');
          setIsLoading(false);
        }
      }
    }
    void loadData();
    return () => { cancelled = true; };
  }, [itemId, serverUrl, session]);

  useEffect(() => {
    const currentSession = session;
    if (!currentSession || !itemId || !selectedSeasonId || details?.type !== 'Series') return;
    let cancelled = false;
    fetchEpisodes(serverUrl, currentSession.userId, itemId, selectedSeasonId, currentSession.accessToken)
      .then(eps => { if (!cancelled) setEpisodes(eps); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedSeasonId, itemId, serverUrl, session, details?.type]);

  async function handlePlay(playItemId: string, resumeTicks?: number | null) {
    if (!session) return;
    setPlaybackErrorMessage('');
    setPlaybackSource(null);
    setPlaybackItemId(playItemId);

    try {
      const [persistedState, nextSource] = await Promise.all([
        window.embyDesktop.storage.read(),
        fetchPlaybackStreamSource({ serverUrl, userId: session.userId, itemId: playItemId, accessToken: session.accessToken })
      ]);
      await window.embyDesktop.player.preflight(nextSource);
      
      const progressByItemId = getPersistedProgressByItemIdForAccount(persistedState.progressByItemId, resolvedActiveAccountId);
      const savedPositionSeconds = progressByItemId[playItemId]?.positionSeconds ?? null;
      
      setInitialPositionSeconds(getResumePositionSeconds({ savedPositionSeconds, serverPositionTicks: resumeTicks === undefined ? null : resumeTicks }));
      setPlaybackSource(nextSource);
    } catch (err) {
      setPlaybackSource(null);
      setPlaybackErrorMessage('Could not prepare desktop playback.');
    }
  }

  async function handleProgress({ itemId: progressItemId, positionSeconds, durationSeconds }: { itemId: string; positionSeconds: number; durationSeconds: number; }) {
    if (!session || progressItemId !== playbackItemId) return;

    const normalizedPositionSeconds = Math.max(0, Math.floor(positionSeconds));
    const normalizedDurationSeconds = Math.max(0, Math.floor(durationSeconds));
    const nowMs = Date.now();
    const { lastReportedAtMs, lastReportedPositionSeconds } = progressStateRef.current;

    if (
      lastReportedPositionSeconds === normalizedPositionSeconds ||
      (lastReportedAtMs !== null && nowMs - lastReportedAtMs < PROGRESS_REPORT_INTERVAL_MS)
    ) {
      return;
    }

    progressStateRef.current = {
      lastReportedAtMs: nowMs,
      lastReportedPositionSeconds: normalizedPositionSeconds,
    };

    const nextProgress: PlaybackProgress = {
      itemId: progressItemId,
      positionSeconds: normalizedPositionSeconds,
      durationSeconds: normalizedDurationSeconds,
      updatedAt: new Date().toISOString(),
    };

    progressSyncQueueRef.current = progressSyncQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          await window.embyDesktop.storage.write({
            progressByItemId: {
              [resolvedActiveAccountId
                ? createAccountScopedProgressKey(resolvedActiveAccountId, progressItemId)
                : progressItemId]: nextProgress,
            },
          });
        } catch {}
        try {
          await reportPlaybackProgress({
            serverUrl,
            accessToken: session.accessToken,
            itemId: progressItemId,
            positionSeconds: normalizedPositionSeconds,
          });
        } catch {}
      });

    await progressSyncQueueRef.current;
  }

  if (isLoading) {
    return <AuthenticatedLayout><p>Loading item details...</p></AuthenticatedLayout>;
  }
  if (errorMessage || !details) {
    return <AuthenticatedLayout><p role="alert">{errorMessage || 'Not found'}</p></AuthenticatedLayout>;
  }

  return (
    <AuthenticatedLayout title={details.name}>
      {playbackErrorMessage ? <p role="alert">{playbackErrorMessage}</p> : null}
      
      {session && initialPositionSeconds !== null && playbackSource ? (
        <PlayerPage
          httpHeaders={playbackSource.httpHeaders}
          itemId={playbackItemId}
          title={details.name}
          streamUrl={playbackSource.streamUrl}
          initialPositionSeconds={initialPositionSeconds}
          onProgress={handleProgress}
        />
      ) : null}

      {!playbackSource && (
        <ItemDetailsPage 
          details={details} 
          similarItems={similarItems}
          seasons={seasons}
          episodes={episodes}
          selectedSeasonId={selectedSeasonId}
          onSelectSeason={setSelectedSeasonId}
          onPlay={handlePlay}
        />
      )}
    </AuthenticatedLayout>
  );
}

`;

const finalContent = content.substring(0, startIdx) + newComponents + content.substring(endIdx);
fs.writeFileSync('src/renderer/app/router.tsx', finalContent);
