import { readFileSync } from 'node:fs';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomePage } from './HomePage';

describe('HomePage', () => {
  afterEach(() => {
    delete (window as Partial<Window>).embyDesktop;
  });

  it('renders continue watching, libraries, and featured rows', () => {
    const libraries = [
      {
        id: 'library-1',
        title: 'Library 1',
        posterUrl: 'https://demo.local/lib-1.jpg',
        imageCandidates: [],
        href: '/libraries/library-1',
      },
    ];

    render(
      <MemoryRouter>
        <HomePage
          accountLabel="ShrekMedia / trans"
          continueWatching={[
            {
              id: 'item-1',
              title: 'Movie 1',
              subtitle: 'Resume from 12 min',
              posterUrl: 'https://demo.local/poster-1.jpg',
              imageCandidates: [],
              href: '/player/item-1',
            },
          ]}
          libraries={libraries}
          featuredRows={[
            {
              id: 'row-1',
              title: 'Featured Movies',
              href: '/libraries/library-1',
              items: [
                {
                  id: 'item-2',
                  title: 'Feature 1',
                  subtitle: '2026',
                  posterUrl: 'https://demo.local/poster-2.jpg',
                  imageCandidates: [],
                  href: '/player/item-2',
                },
              ],
            },
          ]}
          sortMode="latest_added"
          onSortModeChange={() => undefined}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'ShrekMedia / trans' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '\u5a92\u4f53\u5e93' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Featured Movies' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Movie 1/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Feature 1/ })).toBeInTheDocument();
  });

  it('does not render aggregate tabs on the normal home screen', () => {
    render(
      <MemoryRouter>
        <HomePage
          accountLabel="Shrek"
          continueWatching={[
            {
              id: 'item-1',
              title: 'Movie 1',
              subtitle: 'S1E1',
              posterUrl: 'https://demo.local/poster-1.jpg',
              imageCandidates: [],
              href: '/player/item-1',
            },
          ]}
          libraries={[]}
          featuredRows={[
            {
              id: 'row-1',
              title: 'OkEmby',
              href: '/libraries/library-1',
              items: [
                {
                  id: 'item-2',
                  title: 'Feature 1',
                  subtitle: '2026',
                  posterUrl: 'https://demo.local/poster-2.jpg',
                  imageCandidates: [],
                  href: '/player/item-2',
                },
              ],
            },
          ]}
          sortMode="latest_added"
          onSortModeChange={() => undefined}
        />
      </MemoryRouter>
    );

    expect(screen.queryByRole('navigation', { name: '\u805a\u5408\u89c6\u754c' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Shrek' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'OkEmby' })).toBeInTheDocument();
  });

  it('does not render a featured row when the library has no preview items', () => {
    render(
      <MemoryRouter>
        <HomePage
          accountLabel="ShrekMedia / trans"
          continueWatching={[]}
          libraries={[]}
          featuredRows={[
            {
              id: 'empty-row',
              title: 'Empty Row',
              href: '/libraries/empty-row',
              items: [],
            },
            {
              id: 'movies',
              title: 'Movies',
              href: '/libraries/movies',
              items: [
                {
                  id: 'item-1',
                  title: 'Movie 1',
                  subtitle: '2026',
                  posterUrl: 'https://demo.local/poster-1.jpg',
                  imageCandidates: [],
                  href: '/player/item-1',
                },
              ],
            },
          ]}
          sortMode="latest_added"
          onSortModeChange={() => undefined}
        />
      </MemoryRouter>
    );

    expect(screen.queryByRole('heading', { name: 'Empty Row' })).not.toBeInTheDocument();
    expect(screen.queryByText('No items available yet.')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Movies' })).toBeInTheDocument();
  });

  it('falls back from a broken library-card primary image to the thumb candidate', () => {
    const libraries = [
      {
        id: 'library-1',
        title: 'Library 1',
        posterUrl: 'https://demo.local/lib-primary.jpg',
        imageCandidates: [
          {
            url: 'https://demo.local/lib-primary.jpg',
            kind: 'primary' as const,
          },
          {
            url: 'https://demo.local/lib-thumb.jpg',
            kind: 'thumb' as const,
          },
        ],
        href: '/libraries/library-1',
      },
    ];

    render(
      <MemoryRouter>
        <HomePage
          accountLabel="ShrekMedia / trans"
          continueWatching={[]}
          libraries={libraries}
          featuredRows={[]}
          sortMode="latest_added"
          onSortModeChange={() => undefined}
        />
      </MemoryRouter>
    );

    const image = screen.getByRole('img', { name: 'Library 1' });
    expect(image).toHaveAttribute('src', 'https://demo.local/lib-primary.jpg');
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('decoding', 'async');

    fireEvent.error(image);

    expect(screen.getByRole('img', { name: 'Library 1' })).toHaveAttribute(
      'src',
      'https://demo.local/lib-thumb.jpg'
    );
  });

  it('uses the desktop image cache for library card images', async () => {
    const resolve = vi.fn().mockResolvedValue({
      url: 'taluxa-image-cache://library-hash',
      fromCache: true,
    });
    window.embyDesktop = {
      imageCache: {
        resolve,
      },
    } as unknown as Window['embyDesktop'];

    render(
      <MemoryRouter>
        <HomePage
          accountLabel="ShrekMedia / trans"
          continueWatching={[]}
          libraries={[
            {
              id: 'library-1',
              title: 'Library 1',
              posterUrl: 'https://demo.local/lib-primary.jpg',
              imageCandidates: [],
              href: '/libraries/library-1',
            },
          ]}
          featuredRows={[]}
          sortMode="latest_added"
          onSortModeChange={() => undefined}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Library 1' })).toHaveAttribute(
        'src',
        'taluxa-image-cache://library-hash'
      );
    });
    expect(resolve).toHaveBeenCalledWith('https://demo.local/lib-primary.jpg');
  });

  it('styles the library row as a horizontal sliding window', () => {
    const styles = readFileSync('src/renderer/styles.css', 'utf8');
    const libraryGridRule = styles.match(/\.library-card-grid\s*\{(?<body>[^}]*)\}/);

    expect(libraryGridRule?.groups?.body).toContain('grid-auto-flow: column');
    expect(libraryGridRule?.groups?.body).toContain('overflow-x: auto');
  });

  it('uses compact text spacing for continue-watching cards', () => {
    const styles = readFileSync('src/renderer/styles.css', 'utf8');
    const continueCardRule = styles.match(/\.poster-card--continue\s*\{(?<body>[^}]*)\}/);
    const continueTitleRule = styles.match(
      /\.poster-card--continue\s+\.poster-card__title\s*\{(?<body>[^}]*)\}/
    );
    const continueSubtitleRule = styles.match(
      /\.poster-card--continue\s+\.poster-card__subtitle\s*\{(?<body>[^}]*)\}/
    );

    expect(continueCardRule?.groups?.body).toContain('gap: 6px');
    expect(continueTitleRule?.groups?.body).toContain('margin-top: 4px');
    expect(continueSubtitleRule?.groups?.body).toContain('margin-top: 1px');
  });
});
