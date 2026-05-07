import { useEffect, useState } from 'react';

export interface PlayerPageProps {
  episodeSelector?: PlayerEpisodeSelector;
  httpHeaders?: Record<string, string>;
  itemId: string;
  launchRequestId?: number;
  title: string;
  streamUrl: string;
  initialPositionSeconds: number;
  onEpisodeSelect?: (itemId: string) => void;
  onProgress: (input: {
    itemId: string;
    positionSeconds: number;
    durationSeconds: number;
  }) => void | Promise<void>;
}

type PlayerLaunch = Window['embyDesktop']['player']['launch'];
type PlayerEpisodeSelector = NonNullable<Parameters<PlayerLaunch>[0]['episodeSelector']>;

const pendingLaunchKeysByBridge = new WeakMap<PlayerLaunch, Set<string>>();

function createLaunchKey({
  httpHeaders,
  initialPositionSeconds,
  itemId,
  episodeSelector,
  streamUrl,
  title,
}: {
  episodeSelector?: PlayerEpisodeSelector;
  httpHeaders: Record<string, string>;
  initialPositionSeconds: number;
  itemId: string;
  streamUrl: string;
  title: string;
}): string {
  return JSON.stringify({
    episodeSelector,
    httpHeaders,
    initialPositionSeconds,
    itemId,
    streamUrl,
    title,
  });
}

function getPendingLaunchKeys(launch: PlayerLaunch): Set<string> {
  const existingKeys = pendingLaunchKeysByBridge.get(launch);

  if (existingKeys) {
    return existingKeys;
  }

  const nextKeys = new Set<string>();
  pendingLaunchKeysByBridge.set(launch, nextKeys);

  return nextKeys;
}

export function PlayerPage({
  episodeSelector,
  httpHeaders = {},
  itemId,
  launchRequestId,
  title,
  streamUrl,
  initialPositionSeconds,
  onEpisodeSelect,
  onProgress,
}: PlayerPageProps) {
  const [launchError, setLaunchError] = useState('');
  const launchKey =
    launchRequestId === undefined
      ? createLaunchKey({
          episodeSelector,
          httpHeaders,
          initialPositionSeconds,
          itemId,
          streamUrl,
          title,
        })
      : String(launchRequestId);

  useEffect(() => {
    let cancelled = false;

    setLaunchError('');
    const launch = window.embyDesktop.player.launch;
    const pendingLaunchKeys = getPendingLaunchKeys(launch);

    if (pendingLaunchKeys.has(launchKey)) {
      return () => {
        cancelled = true;
      };
    }

    pendingLaunchKeys.add(launchKey);

    launch({
        episodeSelector,
        httpHeaders,
        itemId,
        title,
        streamUrl,
        startSeconds: initialPositionSeconds,
      })
      .then(() => {
        return undefined;
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const message =
            error instanceof Error && error.message.trim()
              ? error.message.trim()
              : 'Could not start desktop playback. Restart the app and try again.';
          setLaunchError(message);
        }
      })
      .finally(() => {
        pendingLaunchKeys.delete(launchKey);
      });

    return () => {
      cancelled = true;
    };
  }, [launchKey]);

  useEffect(() => {
    return window.embyDesktop.player.onProgress((event) => {
      if (event.itemId !== itemId) {
        return;
      }

      void onProgress(event);
    });
  }, [itemId, onProgress]);

  useEffect(() => {
    if (!onEpisodeSelect || typeof window.embyDesktop.player.onEpisodeSelect !== 'function') {
      return undefined;
    }

    return window.embyDesktop.player.onEpisodeSelect((nextItemId) => {
      if (nextItemId !== itemId) {
        onEpisodeSelect(nextItemId);
      }
    });
  }, [itemId, onEpisodeSelect]);

  if (launchError) {
    return (
      <div data-testid="player-page">
        <p className="player-error" role="alert">
          {launchError}
        </p>
      </div>
    );
  }

  return <div style={{ display: 'none' }} data-testid="player-page" />;
}
