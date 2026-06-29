import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { PosterCard } from './PosterCard';

describe('PosterCard', () => {
  afterEach(() => {
    delete (window as Partial<Window>).embyDesktop;
  });

  it('uses the desktop image cache when it resolves a poster url', async () => {
    const resolve = vi.fn().mockResolvedValue({
      url: 'taluxa-image-cache://poster-hash',
      fromCache: true,
    });
    window.embyDesktop = {
      imageCache: {
        resolve,
      },
    } as unknown as Window['embyDesktop'];

    render(
      <MemoryRouter>
        <PosterCard
          title="Movie 1"
          subtitle="2026"
          posterUrl="https://demo.local/poster.jpg"
          imageCandidates={[]}
          href="/player/item-1"
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Movie 1' })).toHaveAttribute(
        'src',
        'taluxa-image-cache://poster-hash'
      );
    });
    expect(resolve).toHaveBeenCalledWith('https://demo.local/poster.jpg');
  });

  it('falls back from the primary image to thumb before showing a placeholder', () => {
    render(
      <MemoryRouter>
        <PosterCard
          title="Movie 1"
          subtitle="2026"
          posterUrl="https://demo.local/poster.jpg"
          imageCandidates={[
            {
              url: 'https://demo.local/poster.jpg',
              kind: 'primary',
            },
            {
              url: 'https://demo.local/thumb.jpg',
              kind: 'thumb',
            },
          ]}
          href="/player/item-1"
        />
      </MemoryRouter>
    );

    const image = screen.getByRole('img', { name: 'Movie 1' });
    expect(image).toHaveAttribute('src', 'https://demo.local/poster.jpg');
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('decoding', 'async');

    fireEvent.error(image);
    expect(screen.getByRole('img', { name: 'Movie 1' })).toHaveAttribute(
      'src',
      'https://demo.local/thumb.jpg'
    );

    fireEvent.error(screen.getByRole('img', { name: 'Movie 1' }));
    expect(screen.queryByRole('img', { name: 'Movie 1' })).not.toBeInTheDocument();
    expect(
      screen
        .getByRole('link', { name: /Movie 1/i })
        .querySelector('.poster-card__image--placeholder')
    ).not.toBeNull();
  });

  it('renders a clamped image progress bar when progress is provided', () => {
    render(
      <MemoryRouter>
        <PosterCard
          title="Movie 1"
          subtitle="2026"
          posterUrl="https://demo.local/poster.jpg"
          imageCandidates={[]}
          href="/player/item-1"
          progressPercent={25}
        />
      </MemoryRouter>
    );

    const progress = screen.getByRole('progressbar', { name: 'Watching progress' });
    expect(progress).toHaveAttribute('aria-valuenow', '25');
    expect(progress.querySelector('.poster-card__progress-fill')).toHaveStyle({ width: '25%' });
  });

  it('does not reset failover when rerendered with a new candidate array for the same urls', () => {
    const { rerender } = render(
      <MemoryRouter>
        <PosterCard
          title="Movie 1"
          subtitle="2026"
          posterUrl="https://demo.local/poster.jpg"
          imageCandidates={[
            {
              url: 'https://demo.local/thumb.jpg',
              kind: 'thumb',
            },
          ]}
          href="/player/item-1"
        />
      </MemoryRouter>
    );

    fireEvent.error(screen.getByRole('img', { name: 'Movie 1' }));
    expect(screen.getByRole('img', { name: 'Movie 1' })).toHaveAttribute(
      'src',
      'https://demo.local/thumb.jpg'
    );

    rerender(
      <MemoryRouter>
        <PosterCard
          title="Movie 1"
          subtitle="2026"
          posterUrl="https://demo.local/poster.jpg"
          imageCandidates={[
            {
              url: 'https://demo.local/thumb.jpg',
              kind: 'thumb',
            },
          ]}
          href="/player/item-1"
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('img', { name: 'Movie 1' })).toHaveAttribute(
      'src',
      'https://demo.local/thumb.jpg'
    );
  });
});
