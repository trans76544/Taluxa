import { useEffect, useState } from 'react';

export interface PlayerPageProps {
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
        itemId,
        title,
        streamUrl,
        startSeconds: initialPositionSeconds,
      })
      .catch(() => {
        if (!cancelled) {
          setLaunchError('Could not start desktop playback. Restart the app and try again.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialPositionSeconds, itemId, streamUrl, title]);

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
      {launchError ? <p role="alert">{launchError}</p> : <p>Launching mpv...</p>}
    </section>
  );
}
