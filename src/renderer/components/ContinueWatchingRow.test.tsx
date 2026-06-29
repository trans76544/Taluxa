import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ContinueWatchingRow } from './ContinueWatchingRow';
import type { HomePosterItem } from '@shared/api/emby/home';

describe('ContinueWatchingRow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createItem(overrides: Partial<HomePosterItem> = {}): HomePosterItem {
    return {
      id: 'episode-1',
      title: 'Series 1',
      subtitle: 'S1E1 - Pilot',
      posterUrl: 'https://demo.emby.local/Items/episode-1/Images/Primary',
      imageCandidates: [],
      href: '/item/series-1',
      state: {
        title: 'Series 1',
        resumeEpisodeId: 'episode-1',
        resumeSeasonId: 'season-1',
        resumeSeasonIndex: 1,
      },
      ...overrides,
    };
  }

  it('opens a right-click menu for continue watching actions', () => {
    const onRemove = vi.fn();
    const onFavorite = vi.fn();
    const onMarkPlayed = vi.fn();
    const item = createItem();

    render(
      <MemoryRouter>
        <ContinueWatchingRow
          title="继续观看"
          items={[item]}
          onRemoveFromContinueWatching={onRemove}
          onAddToFavorites={onFavorite}
          onMarkPlayed={onMarkPlayed}
        />
      </MemoryRouter>
    );

    fireEvent.contextMenu(screen.getByRole('link', { name: /Series 1/ }));

    fireEvent.click(screen.getByRole('menuitem', { name: '从继续观看中移除' }));
    expect(onRemove).toHaveBeenCalledWith(item);

    fireEvent.contextMenu(screen.getByRole('link', { name: /Series 1/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: '添加到收藏' }));
    expect(onFavorite).toHaveBeenCalledWith(item);

    fireEvent.contextMenu(screen.getByRole('link', { name: /Series 1/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: '标记为已播放' }));
    expect(onMarkPlayed).toHaveBeenCalledWith(item);
  });

  it('normalizes duplicate continue-watching artwork candidates before rendering', () => {
    render(
      <MemoryRouter>
        <ContinueWatchingRow
          title="Continue"
          items={[
            createItem({
              posterUrl: '',
              imageCandidates: [
                {
                  url: 'https://demo.emby.local/Items/episode-1/Images/Thumb',
                  kind: 'thumb',
                },
                {
                  url: 'https://demo.emby.local/Items/episode-1/Images/Thumb',
                  kind: 'thumb',
                },
                {
                  url: 'https://demo.emby.local/Items/series-1/Images/Primary',
                  kind: 'parent-primary',
                },
              ],
            }),
          ]}
        />
      </MemoryRouter>
    );

    const image = screen.getByRole('img', { name: 'Series 1' });
    expect(image).toHaveAttribute(
      'src',
      'https://demo.emby.local/Items/episode-1/Images/Thumb'
    );

    fireEvent.error(image);
    expect(screen.getByRole('img', { name: 'Series 1' })).toHaveAttribute(
      'src',
      'https://demo.emby.local/Items/series-1/Images/Primary'
    );
  });
});
