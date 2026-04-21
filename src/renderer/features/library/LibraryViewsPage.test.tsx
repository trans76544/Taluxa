import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LibraryViewsPage } from './LibraryViewsPage';

describe('LibraryViewsPage', () => {
  it('renders the available libraries', () => {
    render(
      <MemoryRouter>
        <LibraryViewsPage
          views={[
            {
              id: 'movies',
              name: 'Movies',
              collectionType: 'movies',
            },
            {
              id: 'shows',
              name: 'Shows',
              collectionType: 'tvshows',
            },
          ]}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Your libraries' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Movies' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Shows' })).toBeInTheDocument();
  });
});
