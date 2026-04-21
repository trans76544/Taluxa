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
  }) => void | Promise<void>;
}

function getDurationSeconds(video: HTMLVideoElement): number {
  return Number.isFinite(video.duration) ? Math.floor(video.duration) : 0;
}

function getPositionSeconds(video: HTMLVideoElement): number {
  return Math.floor(video.currentTime);
}

const PROGRESS_REPORT_INTERVAL_MS = 5000;

export function PlayerPage({
  itemId,
  title,
  streamUrl,
  initialPositionSeconds,
  onProgress,
}: PlayerPageProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressStateRef = useRef<{
    lastReportedAtMs: number | null;
    lastReportedPositionSeconds: number | null;
  }>({
    lastReportedAtMs: null,
    lastReportedPositionSeconds: null,
  });
  const progressSyncQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    progressStateRef.current = {
      lastReportedAtMs: null,
      lastReportedPositionSeconds: null,
    };

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

    const positionSeconds = getPositionSeconds(videoRef.current);
    const nowMs = Date.now();
    const { lastReportedAtMs, lastReportedPositionSeconds } = progressStateRef.current;

    if (
      lastReportedPositionSeconds === positionSeconds ||
      (lastReportedAtMs !== null && nowMs - lastReportedAtMs < PROGRESS_REPORT_INTERVAL_MS)
    ) {
      return;
    }

    progressStateRef.current = {
      lastReportedAtMs: nowMs,
      lastReportedPositionSeconds: positionSeconds,
    };

    const progressInput = {
      itemId,
      positionSeconds,
      durationSeconds: getDurationSeconds(videoRef.current),
    };

    progressSyncQueueRef.current = progressSyncQueueRef.current
      .catch(() => undefined)
      .then(() => onProgress(progressInput))
      .catch(() => undefined);
  }

  return (
    <section className="stack">
      <div>
        <h2>{title}</h2>
        <p>HTML5 playback</p>
      </div>

      <video
        controls
        key={streamUrl}
        data-testid="video-player"
        ref={videoRef}
        src={streamUrl}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
      />
    </section>
  );
}
