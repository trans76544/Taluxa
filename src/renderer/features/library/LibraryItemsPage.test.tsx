import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LibraryItemsPage } from './LibraryItemsPage';

describe('LibraryItemsPage', () => {
  it('renders a poster grid and right controls', () => {
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
              communityRating: 8.5,
              productionYear: 2001,
            },
          ]}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('list', { name: '' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Spirited Away' })).toHaveAttribute(
      'src',
      'https://demo.local/spirited-away.jpg'
    );
    expect(screen.getByRole('link', { name: /Spirited Away/i })).toHaveClass('poster-card');
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

    expect(screen.getByText('未找到项目。')).toBeInTheDocument();
  });
});
