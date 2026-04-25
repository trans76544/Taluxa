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
  const [hasLaunched, setHasLaunched] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setLaunchError('');
    setHasLaunched(false);

    window.embyDesktop.player
      .launch({
        httpHeaders,
        itemId,
        title,
        streamUrl,
        startSeconds: initialPositionSeconds,
      })
      .then(() => {
        if (!cancelled) {
          setHasLaunched(true);
        }
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

  return (
    <section className="stack" data-testid="player-page">
      <div>
        <h2>{title}</h2>
        <p>Desktop playback</p>
      </div>
      {launchError ? (
        <p role="alert">{launchError}</p>
      ) : hasLaunched ? (
        <p>mpv window opened. Keep this page open to sync progress.</p>
      ) : (
        <p>Launching mpv...</p>
      )}
    </section>
  );
}
