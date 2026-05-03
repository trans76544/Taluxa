import { useEffect, useState } from 'react';

export interface PlayerPageProps {
  httpHeaders?: Record<string, string>;
  itemId: string;
  title: string;
  streamUrl: string;
  initialPositionSeconds: number;
  onProgress: (input: {
    itemId: string;
    positionSeconds: number;
    durationSeconds: number;
  }) => void | Promise<void>;
}

type PlayerLaunch = Window['embyDesktop']['player']['launch'];

const pendingLaunchKeysByBridge = new WeakMap<PlayerLaunch, Set<string>>();

function createLaunchKey({
  httpHeaders,
  initialPositionSeconds,
  itemId,
  streamUrl,
  title,
}: {
  httpHeaders: Record<string, string>;
  initialPositionSeconds: number;
  itemId: string;
  streamUrl: string;
  title: string;
}): string {
  return JSON.stringify({
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
  httpHeaders = {},
  itemId,
  title,
  streamUrl,
  initialPositionSeconds,
  onProgress,
}: PlayerPageProps) {
  const [launchError, setLaunchError] = useState('');

  useEffect(() => {
    let cancelled = false;

    setLaunchError('');
    const launch = window.embyDesktop.player.launch;
    const launchKey = createLaunchKey({
      httpHeaders,
      initialPositionSeconds,
      itemId,
      streamUrl,
      title,
    });
    const pendingLaunchKeys = getPendingLaunchKeys(launch);

    if (pendingLaunchKeys.has(launchKey)) {
      return () => {
        cancelled = true;
      };
    }

    pendingLaunchKeys.add(launchKey);

    launch({
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
  }, [httpHeaders, initialPositionSeconds, itemId, streamUrl, title]);

  useEffect(() => {
    return window.embyDesktop.player.onProgress((event) => {
      if (event.itemId !== itemId) {
        return;
      }

      void onProgress(event);
    });
  }, [itemId, onProgress]);

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
