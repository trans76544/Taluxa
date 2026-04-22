import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LibraryItemsPage } from './LibraryItemsPage';

function PlayerLocationState() {
  const location = useLocation();

  return <pre>{JSON.stringify(location.state)}</pre>;
}

describe('LibraryItemsPage', () => {
  it('renders a poster grid with metadata-oriented runtime subtitles', () => {
    render(
      <MemoryRouter>
        <LibraryItemsPage
          libraryName="Movies"
          sortMode="latest_added"
          onSortModeChange={() => undefined}
          items={[
            {
              id: 'item-1',
              name: 'Spirited Away',
              posterUrl: 'https://demo.local/spirited-away.jpg',
              imageCandidates: [],
              runtimeTicks: 75000000000,
              serverPositionTicks: 42000000,
            },
            {
              id: 'item-2',
              name: 'Kiki',
              posterUrl: '',
              imageCandidates: [],
              runtimeTicks: null,
              serverPositionTicks: null,
            },
            {
              id: 'item-3',
              name: 'Ponyo',
              posterUrl: '',
              imageCandidates: [],
              runtimeTicks: 0,
              serverPositionTicks: null,
            },
          ]}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Browse items' })).toBeInTheDocument();
    expect(screen.getByText('Movies')).toBeInTheDocument();
    expect(screen.getByRole('list')).toHaveClass('library-items-grid');
    expect(screen.getByRole('img', { name: 'Spirited Away' })).toHaveAttribute(
      'src',
      'https://demo.local/spirited-away.jpg'
    );
    expect(screen.getByRole('link', { name: /Spirited Away/i })).toHaveClass('poster-card');
    expect(screen.getByText('125 min')).toBeInTheDocument();
    expect(screen.getAllByText('Unknown runtime')).toHaveLength(2);
  });

  it('preserves title and server position in player navigation state', () => {
    render(
      <MemoryRouter initialEntries={['/libraries/movies']}>
        <Routes>
          <Route
            path="/libraries/:viewId"
            element={
              <LibraryItemsPage
                libraryName="Movies"
                sortMode="latest_added"
                onSortModeChange={() => undefined}
                items={[
                  {
                    id: 'item-1',
                    name: 'Spirited Away',
                    posterUrl: 'https://demo.local/spirited-away.jpg',
                    imageCandidates: [],
                    runtimeTicks: 75000000000,
                    serverPositionTicks: 42000000,
                  },
                ]}
              />
            }
          />
          <Route path="/player/:itemId" element={<PlayerLocationState />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('link', { name: /Spirited Away/i }));

    expect(screen.getByText('{"title":"Spirited Away","serverPositionTicks":42000000}')).toBeInTheDocument();
  });

  it('renders an empty state when no items are available', () => {
    render(
      <MemoryRouter>
        <LibraryItemsPage
          libraryName="Movies"
          sortMode="latest_added"
          onSortModeChange={() => undefined}
          items={[]}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('No items found.')).toBeInTheDocument();
  });

  it('lets the user switch the library sort mode to release date', () => {
    const onSortModeChange = vi.fn();

    render(
      <MemoryRouter>
        <LibraryItemsPage
          libraryName="Movies"
          sortMode="latest_added"
          onSortModeChange={onSortModeChange}
          items={[]}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Release Date' }));

    expect(onSortModeChange).toHaveBeenCalledWith('release_date');
  });
});
