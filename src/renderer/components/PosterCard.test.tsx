import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { PosterCard } from './PosterCard';

describe('PosterCard', () => {
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
});
