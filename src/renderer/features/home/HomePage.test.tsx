import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { HomePage } from './HomePage';

describe('HomePage', () => {
  it('renders continue watching, libraries, and featured rows', () => {
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
          libraries={[
            {
              id: 'library-1',
              title: 'Library 1',
              posterUrl: 'https://demo.local/lib-1.jpg',
              href: '/libraries/library-1',
            },
          ]}
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

    expect(screen.getByText('ShrekMedia / trans')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Continue Watching' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Libraries' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Featured Movies' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Movie 1/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Feature 1/ })).toBeInTheDocument();
  });

  it('lets the user switch the featured sort mode to release date', () => {
    const onSortModeChange = vi.fn();

    render(
      <MemoryRouter>
        <HomePage
          accountLabel="ShrekMedia / trans"
          continueWatching={[]}
          libraries={[]}
          featuredRows={[]}
          sortMode="latest_added"
          onSortModeChange={onSortModeChange}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Release Date' }));

    expect(onSortModeChange).toHaveBeenCalledWith('release_date');
  });
});
