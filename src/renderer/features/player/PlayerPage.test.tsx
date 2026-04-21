import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PlayerPage } from './PlayerPage';

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
});
