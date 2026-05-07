import { useEffect, useState } from 'react';
import { PosterCard } from './PosterCard';

import type { HomePosterItem } from '@shared/api/emby/home';

interface ContinueWatchingRowProps {
  title: string;
  items: HomePosterItem[];
  onRemoveFromContinueWatching?: (item: HomePosterItem) => void;
  onAddToFavorites?: (item: HomePosterItem) => void;
  onMarkPlayed?: (item: HomePosterItem) => void;
}

interface ContinueWatchingMenuState {
  item: HomePosterItem;
  x: number;
  y: number;
}

export function ContinueWatchingRow({
  title,
  items,
  onRemoveFromContinueWatching,
  onAddToFavorites,
  onMarkPlayed,
}: ContinueWatchingRowProps) {
  const [menuState, setMenuState] = useState<ContinueWatchingMenuState | null>(null);

  useEffect(() => {
    if (!menuState) {
      return undefined;
    }

    function closeMenu() {
      setMenuState(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeMenu();
      }
    }

    window.addEventListener('click', closeMenu);
    window.addEventListener('blur', closeMenu);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('blur', closeMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuState]);

  function runMenuAction(action: ((item: HomePosterItem) => void) | undefined) {
    const selectedItem = menuState?.item;
    setMenuState(null);

    if (selectedItem && action) {
      action(selectedItem);
    }
  }

  return (
    <section className="home-section">
      <div className="home-section__header">
        <h2>{title}</h2>
      </div>

      {items.length > 0 ? (
        <div className="poster-row-grid">
          {items.map((item) => (
            <PosterCard
              key={item.id}
              title={item.title}
              subtitle={item.subtitle}
              posterUrl={item.posterUrl}
              imageCandidates={item.imageCandidates}
              href={item.href}
              state={item.state}
              landscape={true}
              progressPercent={item.progressPercent}
              className="poster-card--continue"
              onContextMenu={(event) => {
                event.preventDefault();
                const menuWidth = 190;
                const menuHeight = 124;
                setMenuState({
                  item,
                  x: Math.min(event.clientX, Math.max(0, window.innerWidth - menuWidth)),
                  y: Math.min(event.clientY, Math.max(0, window.innerHeight - menuHeight)),
                });
              }}
            />
          ))}
        </div>
      ) : (
        <p className="home-section__empty">Nothing to resume yet.</p>
      )}

      {menuState ? (
        <div
          className="continue-context-menu"
          role="menu"
          style={{ left: menuState.x, top: menuState.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            aria-label="从继续观看中移除"
            onClick={() => runMenuAction(onRemoveFromContinueWatching)}
          >
            <span className="context-menu-icon context-menu-icon--remove" aria-hidden="true" />
            <span>从继续观看中移除</span>
          </button>
          <button
            type="button"
            role="menuitem"
            aria-label="添加到收藏"
            onClick={() => runMenuAction(onAddToFavorites)}
          >
            <span className="context-menu-icon context-menu-icon--favorite" aria-hidden="true" />
            <span>添加到收藏</span>
          </button>
          <button
            type="button"
            role="menuitem"
            aria-label="标记为已播放"
            onClick={() => runMenuAction(onMarkPlayed)}
          >
            <span className="context-menu-icon context-menu-icon--played" aria-hidden="true" />
            <span>标记为已播放</span>
          </button>
        </div>
      ) : null}
    </section>
  );
}
