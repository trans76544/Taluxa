import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ItemDetailsPage } from './ItemDetailsPage';
import type { LibraryItemDetails } from '@shared/models/library';

function createMovieDetails(overrides: Partial<LibraryItemDetails> = {}): LibraryItemDetails {
  return {
    id: 'movie-1',
    name: 'Movie 1',
    type: 'Movie',
    overview: 'A test movie.',
    genres: ['Action'],
    communityRating: 6.4,
    officialRating: 'NR',
    productionYear: 2026,
    runtimeTicks: 60000000000,
    serverPositionTicks: 42000000,
    posterUrl: 'https://demo.local/poster.jpg',
    imageCandidates: [],
    backdropUrl: 'https://demo.local/backdrop.jpg',
    people: [],
    studios: [],
    externalUrls: [],
    mediaSources: [
      {
        id: 'source-1080',
        container: 'mp4',
        path: '/movies/movie-1-1080p.mp4',
        size: 12_000_000_000,
        bitrate: 20_000_000,
        videoCodec: 'hevc',
        videoStream: {
          Width: 1920,
          Height: 1080,
          RealFrameRate: 24,
          Codec: 'hevc',
        },
        audioStreams: [
          {
            Index: 1,
            DisplayTitle: 'AAC stereo',
            Codec: 'aac',
            Channels: 2,
            ChannelLayout: 'stereo',
            IsDefault: true,
          },
          {
            Index: 2,
            DisplayTitle: 'DTS 5.1',
            Codec: 'dts',
            Channels: 6,
            ChannelLayout: '5.1',
          },
        ],
      },
      {
        id: 'source-2160',
        container: 'mp4',
        path: '/movies/movie-1-2160p.mp4',
        size: 27_500_000_000,
        bitrate: 35_100_000,
        videoCodec: 'hevc',
        videoStream: {
          Width: 3840,
          Height: 2160,
          RealFrameRate: 60,
          Codec: 'hevc',
        },
        audioStreams: [
          {
            Index: 5,
            DisplayTitle: 'EAC3 5.1',
            Codec: 'eac3',
            Channels: 6,
            ChannelLayout: '5.1',
            IsDefault: true,
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('ItemDetailsPage', () => {
  it('plays the selected version and audio stream', () => {
    const onPlay = vi.fn();

    render(
      <MemoryRouter>
        <ItemDetailsPage
          details={createMovieDetails()}
          similarItems={[]}
          seasons={[]}
          episodes={[]}
          selectedSeasonId=""
          onSelectSeason={() => undefined}
          onPlay={onPlay}
        />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('版本'), {
      target: { value: 'source-2160' },
    });
    fireEvent.click(screen.getByRole('button', { name: /播放/ }));

    expect(screen.getByLabelText('音频')).toHaveValue('5');
    expect(onPlay).toHaveBeenCalledWith('movie-1', 42000000, {
      mediaSourceId: 'source-2160',
      audioStreamIndex: 5,
    });
  });
});
