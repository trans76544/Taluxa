import { useEffect, useRef } from 'react';
import { seekVideo } from './playerAdapter';

export interface PlayerPageProps {
  itemId: string;
  title: string;
  streamUrl: string;
  initialPositionSeconds: number;
  onProgress: (input: {
    itemId: string;
    positionSeconds: number;
    durationSeconds: number;
  }) => void;
}

function getDurationSeconds(video: HTMLVideoElement): number {
  return Number.isFinite(video.duration) ? Math.floor(video.duration) : 0;
}

function getPositionSeconds(video: HTMLVideoElement): number {
  return Math.floor(video.currentTime);
}

export function PlayerPage({
  itemId,
  title,
  streamUrl,
  initialPositionSeconds,
  onProgress,
}: PlayerPageProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    seekVideo(videoRef.current, initialPositionSeconds);
  }, [initialPositionSeconds, streamUrl]);

  function handleLoadedMetadata() {
    if (!videoRef.current) {
      return;
    }

    seekVideo(videoRef.current, initialPositionSeconds);
  }

  function handleTimeUpdate() {
    if (!videoRef.current) {
      return;
    }

    onProgress({
      itemId,
      positionSeconds: getPositionSeconds(videoRef.current),
      durationSeconds: getDurationSeconds(videoRef.current),
    });
  }

  return (
    <section className="stack">
      <div>
        <h2>{title}</h2>
        <p>HTML5 playback</p>
      </div>

      <video
        controls
        data-testid="video-player"
        ref={videoRef}
        src={streamUrl}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
      />
    </section>
  );
}
