import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ItemDetailsPage } from './ItemDetailsPage';
import type { LibraryEpisode, LibraryItemDetails, LibraryItemMediaSource } from '@shared/models/library';

function createMediaSource(
  id: string,
  overrides: Partial<LibraryItemMediaSource> = {}
): LibraryItemMediaSource {
  return {
    id,
    container: 'mkv',
    path: `/media/${id}.mkv`,
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
    ],
    ...overrides,
  };
}

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
      createMediaSource('source-1080', {
        container: 'mp4',
        path: '/movies/movie-1-1080p.mp4',
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
      }),
      createMediaSource('source-2160', {
        container: 'mp4',
        path: '/movies/movie-1-2160p.mp4',
        size: 27_500_000_000,
        bitrate: 35_100_000,
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
      }),
    ],
    ...overrides,
  };
}

function createSeriesDetails(overrides: Partial<LibraryItemDetails> = {}): LibraryItemDetails {
  return createMovieDetails({
    id: 'series-1',
    name: 'Series 1',
    type: 'Series',
    runtimeTicks: null,
    serverPositionTicks: null,
    mediaSources: [],
    ...overrides,
  });
}

function createEpisode(overrides: Partial<LibraryEpisode> = {}): LibraryEpisode {
  return {
    id: 'episode-1',
    name: 'First Case',
    overview: '',
    indexNumber: 1,
    parentIndexNumber: 1,
    posterUrl: '',
    runtimeTicks: 600000000,
    serverPositionTicks: null,
    mediaSources: [createMediaSource('episode-1-source')],
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

  it('selects a series episode and only plays it when the play button is clicked', () => {
    const onPlay = vi.fn();

    render(
      <MemoryRouter>
        <ItemDetailsPage
          details={createSeriesDetails()}
          similarItems={[]}
          seasons={[]}
          episodes={[
            createEpisode(),
            createEpisode({
              id: 'episode-2',
              name: 'Second Case',
              indexNumber: 2,
              mediaSources: [
                createMediaSource('episode-2-1080', {
                  path: '/series/episode-2-1080p.mkv',
                }),
                createMediaSource('episode-2-2160', {
                  path: '/series/episode-2-2160p.mkv',
                  videoStream: {
                    Width: 3840,
                    Height: 2160,
                    RealFrameRate: 24,
                    Codec: 'hevc',
                  },
                  audioStreams: [
                    {
                      Index: 7,
                      DisplayTitle: 'Japanese FLAC stereo',
                      Codec: 'flac',
                      Channels: 2,
                      ChannelLayout: 'stereo',
                      IsDefault: true,
                    },
                  ],
                }),
              ],
            }),
          ]}
          selectedSeasonId=""
          onSelectSeason={() => undefined}
          onPlay={onPlay}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('link', { name: /2\. Second Case/ }));

    expect(onPlay).not.toHaveBeenCalled();
    expect(screen.getByText('S1:E2 - Second Case')).toBeInTheDocument();
    expect(screen.getByLabelText('版本')).toHaveValue('episode-2-1080');

    fireEvent.change(screen.getByLabelText('版本'), {
      target: { value: 'episode-2-2160' },
    });
    expect(screen.getByLabelText('音频')).toHaveValue('7');

    fireEvent.click(screen.getByRole('button', { name: /播放/ }));

    expect(onPlay).toHaveBeenCalledWith('episode-2', null, {
      title: 'Series 1 - S1:E2 - Second Case',
      mediaSourceId: 'episode-2-2160',
      audioStreamIndex: 7,
    });
  });

  it('selects the continue-watching episode when it is present in the loaded season', () => {
    render(
      <MemoryRouter>
        <ItemDetailsPage
          details={createSeriesDetails()}
          similarItems={[]}
          seasons={[]}
          episodes={[
            createEpisode(),
            createEpisode({
              id: 'episode-2',
              name: 'Second Case',
              indexNumber: 2,
            }),
          ]}
          selectedSeasonId=""
          resumeEpisodeId="episode-2"
          onSelectSeason={() => undefined}
          onPlay={() => undefined}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('S1:E2 - Second Case')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /2\. Second Case/ })).toHaveClass('episode-active');
  });

  it('shows playback progress and played status on episode cards', () => {
    const playedEpisode = {
      ...createEpisode({
        id: 'episode-2',
        name: 'Solved Case',
        indexNumber: 2,
      }),
      played: true,
    };

    render(
      <MemoryRouter>
        <ItemDetailsPage
          details={createSeriesDetails()}
          similarItems={[]}
          seasons={[]}
          episodes={[
            createEpisode({
              id: 'episode-1',
              name: 'In Progress',
              runtimeTicks: 600000000,
              serverPositionTicks: 150000000,
            }),
            playedEpisode,
          ]}
          selectedSeasonId=""
          onSelectSeason={() => undefined}
          onPlay={() => undefined}
        />
      </MemoryRouter>
    );

    const inProgressCard = screen.getByRole('link', { name: /1\. In Progress/ });
    const progress = inProgressCard.querySelector('[role="progressbar"]');
    expect(progress).toHaveAttribute('aria-valuenow', '25');
    expect(progress?.querySelector('.poster-card__progress-fill')).toHaveStyle({ width: '25%' });

    const playedCard = screen.getByRole('link', { name: /2\. Solved Case/ });
    expect(playedCard.querySelector('.poster-card__played-indicator')).not.toBeNull();
  });
});
