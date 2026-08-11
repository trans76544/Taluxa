import { useEffect, useRef, useState } from 'react';
import { redactErrorMessage } from '@shared/network/redaction';

export interface PlayerLaunchReadyEvent {
  itemId: string;
  launchRequestId?: number;
  playerSessionId?: number;
}

export interface PlayerLaunchFailureEvent extends PlayerLaunchReadyEvent {
  message: string;
}

export interface PlayerPageProps {
  authMode?: 'header' | 'local-proxy' | 'tokenless';
  episodeSelector?: PlayerEpisodeSelector;
  httpHeaders?: Record<string, string>;
  itemId: string;
  initialPlayerSessionId?: number;
  launchRequestId?: number;
  redactedDisplayUrl?: string;
  title: string;
  streamUrl: string;
  initialPositionSeconds: number;
  onEpisodeSelect?: (itemId: string, playerSessionId?: number) => void | Promise<boolean | void>;
  onLaunchFailure?: (event: PlayerLaunchFailureEvent) => void;
  onLaunchReady?: (event: PlayerLaunchReadyEvent) => void;
  onProgress: (input: {
    itemId: string;
    positionSeconds: number;
    durationSeconds: number;
    final?: boolean;
  }, playerSessionId?: number) => void | Promise<void>;
}

type PlayerLaunch = Window['embyDesktop']['player']['launch'];
type PlayerEpisodeSelector = NonNullable<Parameters<PlayerLaunch>[0]['episodeSelector']>;

const pendingLaunchPromisesByBridge = new WeakMap<PlayerLaunch, Map<string, ReturnType<PlayerLaunch>>>();

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

function getPendingLaunchPromises(launch: PlayerLaunch): Map<string, ReturnType<PlayerLaunch>> {
  const existingPromises = pendingLaunchPromisesByBridge.get(launch);

  if (existingPromises) {
    return existingPromises;
  }

  const nextPromises = new Map<string, ReturnType<PlayerLaunch>>();
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
  initialPlayerSessionId,
  onEpisodeSelect,
  onLaunchFailure,
  onLaunchReady,
  onProgress,
}: PlayerPageProps) {
  const [launchError, setLaunchError] = useState('');
  const [playerSessionId, setPlayerSessionId] = useState<number | null>(initialPlayerSessionId ?? null);
  const currentItemIdRef = useRef(itemId);
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
      .then((result) => {
        if (result?.playerSessionId) {
          setPlayerSessionId(result.playerSessionId);
        }
        if (!cancelled) {
          onLaunchReady?.({
            itemId,
            launchRequestId,
            ...(result?.playerSessionId ? { playerSessionId: result.playerSessionId } : {}),
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
      if (playerSessionId === null
        ? event.itemId !== itemId
        : event.playerSessionId !== playerSessionId || event.itemId !== currentItemIdRef.current) {
        return;
      }

      void onProgress(event, event.playerSessionId);
    });
  }, [itemId, onProgress, playerSessionId]);

  useEffect(() => {
    if (!onEpisodeSelect || typeof window.embyDesktop.player.onEpisodeSelect !== 'function') {
      return undefined;
    }

    return window.embyDesktop.player.onEpisodeSelect((event) => {
      if (playerSessionId === null
        ? event.itemId === itemId
        : event.playerSessionId !== playerSessionId || event.itemId === currentItemIdRef.current) {
        return;
      }
      currentItemIdRef.current = event.itemId;
      void Promise.resolve(onEpisodeSelect(event.itemId, event.playerSessionId)).then((accepted) => {
        if (accepted !== false) currentItemIdRef.current = event.itemId;
        else if (currentItemIdRef.current === event.itemId) currentItemIdRef.current = itemId;
      });
    });
  }, [itemId, onEpisodeSelect, playerSessionId]);

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
