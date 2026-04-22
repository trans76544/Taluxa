import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlayerPage } from './PlayerPage';

const launchMock = vi.hoisted(() => vi.fn());

function mockPlayerBridge() {
  (window as Window & {
    embyDesktop?: {
      player?: {
        launch: typeof launchMock;
      };
    };
  }).embyDesktop = {
    player: {
      launch: launchMock,
    },
  } as unknown as typeof window.embyDesktop;
}

afterEach(() => {
  vi.resetAllMocks();
  delete (window as Partial<Window>).embyDesktop;
});

describe('PlayerPage', () => {
  it('renders the launch shell and launches mpv playback', () => {
    mockPlayerBridge();

    render(
      <PlayerPage
        itemId="item-1"
        title="Movie 1"
        streamUrl="https://demo.emby.local/Videos/item-1/stream.mp4?static=true&api_key=token-123"
        initialPositionSeconds={42}
      />
    );

    expect(screen.getByRole('heading', { name: 'Movie 1' })).toBeInTheDocument();
    expect(screen.getByText('Opening mpv player...')).toBeInTheDocument();
    expect(screen.queryByTestId('video-player')).not.toBeInTheDocument();
    expect(launchMock).toHaveBeenCalledTimes(1);
    expect(launchMock).toHaveBeenCalledWith({
      title: 'Movie 1',
      streamUrl: 'https://demo.emby.local/Videos/item-1/stream.mp4?static=true&api_key=token-123',
      startSeconds: 42,
    });
  });

  it('relaunches mpv when the media changes', () => {
    mockPlayerBridge();

    const { rerender } = render(
      <PlayerPage
        itemId="item-1"
        title="Movie 1"
        streamUrl="https://demo.emby.local/Videos/item-1/stream.mp4?static=true&api_key=token-123"
        initialPositionSeconds={42}
      />
    );

    expect(launchMock).toHaveBeenCalledWith({
      title: 'Movie 1',
      streamUrl: 'https://demo.emby.local/Videos/item-1/stream.mp4?static=true&api_key=token-123',
      startSeconds: 42,
    });

    rerender(
      <PlayerPage
        itemId="item-2"
        title="Movie 2"
        streamUrl="https://demo.emby.local/Videos/item-2/stream.mp4?static=true&api_key=token-123"
        initialPositionSeconds={0}
      />
    );

    expect(screen.getByRole('heading', { name: 'Movie 2' })).toBeInTheDocument();
    expect(launchMock).toHaveBeenLastCalledWith({
      title: 'Movie 2',
      streamUrl: 'https://demo.emby.local/Videos/item-2/stream.mp4?static=true&api_key=token-123',
      startSeconds: 0,
    });
    expect(launchMock).toHaveBeenCalledTimes(2);
  });
});
