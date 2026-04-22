import { useEffect } from 'react';

export interface PlayerPageProps {
  itemId: string;
  title: string;
  streamUrl: string;
  initialPositionSeconds: number;
  onProgress?: (input: {
    itemId: string;
    positionSeconds: number;
    durationSeconds: number;
  }) => void | Promise<void>;
}

export function PlayerPage({
  title,
  streamUrl,
  initialPositionSeconds,
}: PlayerPageProps) {
  useEffect(() => {
    const playerBridge = (window as Window & {
      embyDesktop?: {
        player?: {
          launch: (input: {
            title: string;
            streamUrl: string;
            startSeconds: number;
          }) => void | Promise<void>;
        };
      };
    }).embyDesktop?.player;

    playerBridge?.launch({
      title,
      streamUrl,
      startSeconds: initialPositionSeconds,
    });
  }, [initialPositionSeconds, streamUrl, title]);

  return (
    <section className="stack">
      <div>
        <h2>{title}</h2>
        <p>Opening mpv player...</p>
      </div>
    </section>
  );
}
