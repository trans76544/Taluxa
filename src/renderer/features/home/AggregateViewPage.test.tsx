import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AggregateViewPage } from './AggregateViewPage';

describe('AggregateViewPage', () => {
  it('renders the aggregate navigation only inside the aggregate page', () => {
    render(
      <MemoryRouter>
        <AggregateViewPage
          rows={[
            {
              id: 'server-1',
              title: 'Shrek',
              items: [
                {
                  accountId: 'account-1',
                  id: 'item-1',
                  title: 'Movie 1',
                  subtitle: 'S1E1',
                  posterUrl: 'https://demo.local/poster-1.jpg',
                  imageCandidates: [],
                  href: '/item/item-1',
                },
              ],
            },
          ]}
          onOpenItem={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('navigation', { name: '聚合视界' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '继续播放' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '收藏' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '媒体库' })).toHaveAttribute('href', '/libraries');
    expect(screen.getByRole('heading', { name: 'Shrek' })).toBeInTheDocument();
  });

  it('keeps aggregate tabs in document flow instead of overlaying content', () => {
    const styles = readFileSync('src/renderer/styles.css', 'utf8');
    const tabsRule = styles.match(/\.aggregate-tabs\s*\{(?<body>[^}]*)\}/);

    expect(tabsRule?.groups?.body).not.toContain('position: sticky');
    expect(tabsRule?.groups?.body).not.toContain('position: fixed');
  });
});
