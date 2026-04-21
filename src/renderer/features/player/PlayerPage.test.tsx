import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlayerPage } from './PlayerPage';
import { seekVideo } from './playerAdapter';

vi.mock('./playerAdapter', () => ({
  seekVideo: vi.fn(),
}));

const seekVideoMock = vi.mocked(seekVideo);

afterEach(() => {
  vi.useRealTimers();
});

describe('PlayerPage', () => {
  it('renders the selected video title', () => {
    render(
      <PlayerPage
        itemId="item-1"
        title="Movie 1"
        streamUrl="https://demo.emby.local/Videos/item-1/stream.mp4?static=true&api_key=token-123"
        initialPositionSeconds={0}
        onProgress={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: 'Movie 1' })).toBeInTheDocument();
  });

  it('renders a video element', () => {
    render(
      <PlayerPage
        itemId="item-1"
        title="Movie 1"
        streamUrl="https://demo.emby.local/Videos/item-1/stream.mp4?static=true&api_key=token-123"
        initialPositionSeconds={0}
        onProgress={vi.fn()}
      />
    );

    expect(screen.getByTestId('video-player')).toBeInTheDocument();
  });

  it('throttles progress updates and deduplicates integer positions', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-21T00:00:00.000Z'));
    const onProgress = vi.fn();

    render(
      <PlayerPage
        itemId="item-1"
        title="Movie 1"
        streamUrl="https://demo.emby.local/Videos/item-1/stream.mp4?static=true&api_key=token-123"
        initialPositionSeconds={0}
        onProgress={onProgress}
      />
    );

    const video = screen.getByTestId('video-player') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      value: 12.2,
      writable: true,
    });
    Object.defineProperty(video, 'duration', {
      configurable: true,
      value: 180,
      writable: true,
    });

    fireEvent.timeUpdate(video);
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenLastCalledWith({
      itemId: 'item-1',
      positionSeconds: 12,
      durationSeconds: 180,
    });

    vi.setSystemTime(new Date('2026-04-21T00:00:01.000Z'));
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      value: 13.4,
      writable: true,
    });
    fireEvent.timeUpdate(video);
    expect(onProgress).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-04-21T00:00:06.000Z'));
    fireEvent.timeUpdate(video);
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith({
      itemId: 'item-1',
      positionSeconds: 13,
      durationSeconds: 180,
    });

    vi.setSystemTime(new Date('2026-04-21T00:00:12.000Z'));
    fireEvent.timeUpdate(video);
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it('remounts the video element and seeks to zero when switching media', () => {
    const { rerender } = render(
      <PlayerPage
        itemId="item-1"
        title="Movie 1"
        streamUrl="https://demo.emby.local/Videos/item-1/stream.mp4?static=true&api_key=token-123"
        initialPositionSeconds={42}
        onProgress={vi.fn()}
      />
    );

    expect(seekVideoMock).toHaveBeenCalledWith(expect.any(HTMLVideoElement), 42);
    const firstVideo = screen.getByTestId('video-player');

    seekVideoMock.mockClear();

    rerender(
      <PlayerPage
        itemId="item-2"
        title="Movie 2"
        streamUrl="https://demo.emby.local/Videos/item-2/stream.mp4?static=true&api_key=token-123"
        initialPositionSeconds={0}
        onProgress={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: 'Movie 2' })).toBeInTheDocument();
    expect(screen.getByTestId('video-player')).not.toBe(firstVideo);
    expect(seekVideoMock).toHaveBeenCalledWith(expect.any(HTMLVideoElement), 0);
  });
});