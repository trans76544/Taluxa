import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
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
              href: '/player/item-1',
            },
          ]}
          libraries={[
            {
              id: 'library-1',
              title: '动画电影',
              posterUrl: 'https://demo.local/lib-1.jpg',
              href: '/libraries/library-1',
            },
          ]}
          featuredRows={[
            {
              id: 'row-1',
              title: '动画电影',
              href: '/libraries/library-1',
              items: [
                {
                  id: 'item-2',
                  title: 'Feature 1',
                  subtitle: '2026',
                  posterUrl: 'https://demo.local/poster-2.jpg',
                  href: '/player/item-2',
                },
              ],
            },
          ]}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('ShrekMedia / trans')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Continue Watching' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Libraries' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '动画电影' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Movie 1/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Feature 1/ })).toBeInTheDocument();
  });
});
