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

    window.embyDesktop.player
      .launch({
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
