import { readFileSync } from 'node:fs';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomePage } from './HomePage';
import type { HomeLibraryCard, HomePosterItem, HomePosterRow } from '@shared/api/emby/home';

function createLibraries(): HomeLibraryCard[] {
  return [
    {
      id: 'latest',
      title: 'Latest Episodes',
      posterUrl: 'https://demo.local/latest.jpg',
      imageCandidates: [],
      href: '/libraries/latest',
      state: { libraryName: 'Latest Episodes' },
    },
    {
      id: 'domestic',
      title: 'Domestic Dramas',
      posterUrl: 'https://demo.local/domestic.jpg',
      imageCandidates: [],
      href: '/libraries/domestic',
      state: { libraryName: 'Domestic Dramas' },
    },
    {
      id: 'global',
      title: 'Global Shows',
      posterUrl: 'https://demo.local/global.jpg',
      imageCandidates: [],
      href: '/libraries/global',
      state: { libraryName: 'Global Shows' },
    },
  ];
}

function createContinueWatching(): HomePosterItem[] {
  return [
    {
      id: 'resume-1',
      title: 'Resume Movie',
      subtitle: 'Resume from 12 min',
      posterUrl: 'https://demo.local/resume-1.jpg',
      imageCandidates: [],
      href: '/player/resume-1',
      state: { title: 'Resume Movie' },
      progressPercent: 42,
    },
  ];
}

function createFeaturedRows(): HomePosterRow[] {
  return [
    {
      id: 'featured',
      title: 'Featured Movies',
      href: '/libraries/featured',
      state: { libraryName: 'Featured Movies' },
      items: [
        {
          id: 'feature-1',
          title: 'Feature 1',
          subtitle: '2026',
          posterUrl: 'https://demo.local/feature-1.jpg',
          imageCandidates: [],
          href: '/player/feature-1',
          state: { title: 'Feature 1' },
        },
      ],
    },
  ];
}

function LocationStateProbe() {
  const location = useLocation();

  return <output data-testid="location-state">{JSON.stringify(location.state)}</output>;
}

function renderHome(overrides: Partial<React.ComponentProps<typeof HomePage>> = {}) {
  return render(
    <MemoryRouter>
      <HomePage
        accountLabel="ShrekMedia / trans"
        continueWatching={createContinueWatching()}
        libraries={createLibraries()}
        featuredRows={createFeaturedRows()}
        sortMode="latest_added"
        onSortModeChange={() => undefined}
        {...overrides}
      />
      <LocationStateProbe />
    </MemoryRouter>
  );
}

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

  it('exposes stable normal home structure hooks', () => {
    const { container } = renderHome();

    expect(container.querySelector('.home-screen')).toBeInTheDocument();
    expect(container.querySelector('.home-screen--aggregate')).not.toBeInTheDocument();
    expect(container.querySelector('.home-section')).toBeInTheDocument();
    expect(container.querySelector('.library-card-grid')).toBeInTheDocument();
    expect(container.querySelector('.poster-row-grid')).toBeInTheDocument();
  });

  it('renders media libraries before resume and detailed rows', () => {
    const { container } = renderHome();
    const sections = Array.from(container.querySelectorAll('.home-section'));
    const headings = sections.map((section) => section.querySelector('h2')?.textContent);

    expect(headings).toEqual(['媒体库', '继续观看', 'Featured Movies']);
  });

  it('preserves library destination href and route state', () => {
    renderHome();

    const domesticLink = screen.getByRole('link', { name: /Domestic Dramas/ });
    expect(domesticLink).toHaveAttribute('href', '/libraries/domestic');

    fireEvent.click(domesticLink);

    expect(screen.getByTestId('location-state')).toHaveTextContent(
      JSON.stringify({ libraryName: 'Domestic Dramas' })
    );
  });

  it('uses larger primary library columns than detailed poster columns', () => {
    const styles = readFileSync('src/renderer/styles.css', 'utf8');
    const libraryGridRule = styles.match(/\.home-section--libraries\s+\.library-card-grid\s*\{(?<body>[^}]*)\}/);
    const posterGridRule = styles.match(/\.poster-row-grid\s*\{(?<body>[^}]*)\}/);
    const libraryCardRule = styles.match(/\.home-section--libraries\s+\.library-card\s*\{(?<body>[^}]*)\}/);
    const libraryCollageRule = styles.match(
      /\.home-section--libraries\s+\.library-card__collage\s*\{(?<body>[^}]*)\}/
    );

    expect(libraryGridRule?.groups?.body).toContain('grid-auto-columns: minmax(300px, 360px)');
    expect(posterGridRule?.groups?.body).toContain('grid-auto-columns: minmax(138px, 156px)');
    expect(libraryCardRule?.groups?.body).toContain('min-height: 188px');
    expect(libraryCollageRule?.groups?.body).toContain('grid-template-columns: 1.12fr 0.88fr');
    expect(libraryCollageRule?.groups?.body).toContain('grid-template-rows: repeat(2, minmax(0, 1fr))');
  });

  it('renders library artwork as a multi-image side-by-side collage', () => {
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
              imageCandidates: [
                {
                  url: 'https://demo.local/lib-thumb.jpg',
                  kind: 'thumb' as const,
                },
                {
                  url: 'https://demo.local/lib-backdrop.jpg',
                  kind: 'backdrop' as const,
                },
              ],
              href: '/libraries/library-1',
            },
          ]}
          featuredRows={[]}
          sortMode="latest_added"
          onSortModeChange={() => undefined}
        />
      </MemoryRouter>
    );

    const libraryCard = screen.getByRole('link', { name: /Library 1/ });
    const collage = libraryCard.querySelector('.library-card__collage');

    expect(collage).toBeInTheDocument();
    expect(collage?.querySelectorAll('.library-card__collage-image')).toHaveLength(3);
  });

  it('keeps continue watching below libraries with playback links intact', () => {
    const { container } = renderHome();
    const sections = Array.from(container.querySelectorAll('.home-section'));
    const sectionClasses = sections.map((section) => section.className);

    expect(sectionClasses[0]).toContain('home-section--libraries');
    expect(sectionClasses[1]).toContain('home-section--continue');
    expect(screen.getByRole('link', { name: /Resume Movie/ })).toHaveAttribute(
      'href',
      '/player/resume-1'
    );
  });

  it('keeps continue watching context menu callbacks working', () => {
    const onRemoveFromContinueWatching = vi.fn();
    renderHome({ onRemoveFromContinueWatching });

    fireEvent.contextMenu(screen.getByRole('link', { name: /Resume Movie/ }));
    fireEvent.click(screen.getAllByRole('menuitem')[0]);

    expect(onRemoveFromContinueWatching).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'resume-1' })
    );
  });

  it('uses compact secondary sizing for continue-watching rows', () => {
    const styles = readFileSync('src/renderer/styles.css', 'utf8');
    const continueGridRule = styles.match(/\.home-section--continue\s+\.poster-row-grid\s*\{(?<body>[^}]*)\}/);
    const continueCardRule = styles.match(/\.home-section--continue\s+\.poster-card--continue\s*\{(?<body>[^}]*)\}/);

    expect(continueGridRule?.groups?.body).toContain('grid-auto-columns: minmax(196px, 204px)');
    expect(continueCardRule?.groups?.body).toContain('gap: 6px');
  });

  it('renders detailed featured rows after primary sections', () => {
    const { container } = renderHome();
    const sections = Array.from(container.querySelectorAll('.home-section'));

    expect(sections[2].className).toContain('home-section--featured');
    expect(sections[2].querySelector('h2')).toHaveTextContent('Featured Movies');
  });

  it('preserves featured row view-all href and route state', () => {
    renderHome();

    const viewAllLink = screen.getByRole('link', { name: 'View all' });
    expect(viewAllLink).toHaveAttribute('href', '/libraries/featured');

    fireEvent.click(viewAllLink);

    expect(screen.getByTestId('location-state')).toHaveTextContent(
      JSON.stringify({ libraryName: 'Featured Movies' })
    );
  });

  it('keeps normal detailed rows scrollable and smaller than library tiles', () => {
    const styles = readFileSync('src/renderer/styles.css', 'utf8');
    const featuredGridRule = styles.match(/\.home-section--featured\s+\.poster-row-grid\s*\{(?<body>[^}]*)\}/);

    expect(featuredGridRule?.groups?.body).toContain('grid-auto-columns: minmax(138px, 156px)');
    expect(featuredGridRule?.groups?.body).toContain('overflow-x: auto');
  });

  it('keeps aggregate home row sizing isolated from normal home rows', () => {
    const styles = readFileSync('src/renderer/styles.css', 'utf8');
    const aggregateGridRule = styles.match(/\.home-screen--aggregate\s+\.poster-row-grid\s*\{(?<body>[^}]*)\}/);

    expect(aggregateGridRule?.groups?.body).toContain('grid-auto-columns: 186px');
    expect(aggregateGridRule?.groups?.body).toContain('scrollbar-width: none');
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

  it('renders a partial refresh warning without hiding loaded content', () => {
    render(
      <MemoryRouter>
        <HomePage
          accountLabel="ShrekMedia / trans"
          continueWatching={[]}
          libraries={[
            {
              id: 'movies',
              title: 'Movies',
              posterUrl: 'https://demo.local/movie.jpg',
              imageCandidates: [],
              href: '/libraries/movies',
            },
          ]}
          featuredRows={[]}
          refreshStatusMessage="Some home sections could not refresh: Shows."
          sortMode="latest_added"
          onSortModeChange={() => undefined}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Some home sections could not refresh: Shows.'
    );
    expect(screen.getByRole('heading', { name: '\u5a92\u4f53\u5e93' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Movies/ })).toBeInTheDocument();
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
