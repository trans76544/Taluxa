import { useEffect, useState } from 'react';
import { redactErrorMessage } from '@shared/network/redaction';

export interface PlayerLaunchReadyEvent {
  itemId: string;
  launchRequestId?: number;
}

export interface PlayerLaunchFailureEvent extends PlayerLaunchReadyEvent {
  message: string;
}

export interface PlayerPageProps {
  authMode?: 'header' | 'local-proxy' | 'tokenless';
  episodeSelector?: PlayerEpisodeSelector;
  httpHeaders?: Record<string, string>;
  itemId: string;
  launchRequestId?: number;
  redactedDisplayUrl?: string;
  title: string;
  streamUrl: string;
  initialPositionSeconds: number;
  onEpisodeSelect?: (itemId: string) => void;
  onLaunchFailure?: (event: PlayerLaunchFailureEvent) => void;
  onLaunchReady?: (event: PlayerLaunchReadyEvent) => void;
  onProgress: (input: {
    itemId: string;
    positionSeconds: number;
    durationSeconds: number;
    final?: boolean;
  }) => void | Promise<void>;
}

type PlayerLaunch = Window['embyDesktop']['player']['launch'];
type PlayerEpisodeSelector = NonNullable<Parameters<PlayerLaunch>[0]['episodeSelector']>;

const pendingLaunchPromisesByBridge = new WeakMap<PlayerLaunch, Map<string, Promise<void>>>();

function createLaunchKey({
  authMode,
  httpHeaders,
  initialPositionSeconds,
  itemId,
  redactedDisplayUrl,
  episodeSelector,
  streamUrl,
  title,
}: {
  authMode?: 'header' | 'local-proxy' | 'tokenless';
  episodeSelector?: PlayerEpisodeSelector;
  httpHeaders: Record<string, string>;
  initialPositionSeconds: number;
  itemId: string;
  redactedDisplayUrl?: string;
  streamUrl: string;
  title: string;
}): string {
  return JSON.stringify({
    authMode,
    episodeSelector,
    httpHeaders,
    initialPositionSeconds,
    itemId,
    redactedDisplayUrl,
    streamUrl,
    title,
  });
}

function getPendingLaunchPromises(launch: PlayerLaunch): Map<string, Promise<void>> {
  const existingPromises = pendingLaunchPromisesByBridge.get(launch);

  if (existingPromises) {
    return existingPromises;
  }

  const nextPromises = new Map<string, Promise<void>>();
  pendingLaunchPromisesByBridge.set(launch, nextPromises);

  return nextPromises;
}

export function PlayerPage({
  authMode,
  episodeSelector,
  httpHeaders = {},
  itemId,
  launchRequestId,
  redactedDisplayUrl,
  title,
  streamUrl,
  initialPositionSeconds,
  onEpisodeSelect,
  onLaunchFailure,
  onLaunchReady,
  onProgress,
}: PlayerPageProps) {
  const [launchError, setLaunchError] = useState('');
  const launchKey =
    launchRequestId === undefined
        ? createLaunchKey({
          authMode,
          episodeSelector,
          httpHeaders,
          initialPositionSeconds,
          itemId,
          redactedDisplayUrl,
          streamUrl,
          title,
        })
      : String(launchRequestId);

  useEffect(() => {
    let cancelled = false;

    setLaunchError('');
    const launch = window.embyDesktop.player.launch;
    const pendingLaunchPromises = getPendingLaunchPromises(launch);
    let launchPromise = pendingLaunchPromises.get(launchKey);

    if (!launchPromise) {
      launchPromise = launch({
        authMode,
        episodeSelector,
        httpHeaders,
        itemId,
        redactedDisplayUrl,
        title,
        streamUrl,
        startSeconds: initialPositionSeconds,
      });
      pendingLaunchPromises.set(launchKey, launchPromise);
    }

    launchPromise
      .then(() => {
        if (!cancelled) {
          onLaunchReady?.({
            itemId,
            launchRequestId,
          });
        }
        return undefined;
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const message =
            error instanceof Error && error.message.trim()
              ? redactErrorMessage(error)
              : 'Could not start desktop playback. Restart the app and try again.';
          setLaunchError(message);
          onLaunchFailure?.({
            itemId,
            launchRequestId,
            message,
          });
        }
      })
      .finally(() => {
        if (pendingLaunchPromises.get(launchKey) === launchPromise) {
          pendingLaunchPromises.delete(launchKey);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [launchKey]);

  useEffect(() => {
    if (typeof window.embyDesktop.player.onPlaybackEvent === 'function') return undefined;
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
