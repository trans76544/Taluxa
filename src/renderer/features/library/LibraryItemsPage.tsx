import { useState } from 'react';
import { PosterCard } from '@renderer/components/PosterCard';
import type { LibraryItem } from '@shared/models/library';
import type { LibrarySortMode } from '@shared/models/settings';

interface LibraryItemsPageProps {
  libraryName: string;
  sortMode: LibrarySortMode;
  onSortModeChange: (nextSortMode: LibrarySortMode) => void;
  items: LibraryItem[];
}

const SORT_OPTIONS: Array<{ label: string; value: LibrarySortMode }> = [
  { label: '更新日期', value: 'latest_added' },
  { label: '加入日期', value: 'date_added' },
  { label: '标题', value: 'sort_name' },
  { label: 'IMDb评分', value: 'community_rating' },
  { label: '影评人评分', value: 'critic_rating' },
  { label: '出品年份', value: 'production_year' },
  { label: '首映日期', value: 'premiere_date' },
  { label: '官方评级', value: 'official_rating' },
  { label: '播放日期', value: 'date_played' },
  { label: '播放时长', value: 'runtime' },
];

function formatSubtitle(item: LibraryItem) {
  if (item.productionYear) {
    // Determine if it represents a series that has multiple years or just one, fallback to standard formatting
    return `${item.productionYear}`; 
  }
  if (typeof item.runtimeTicks === 'number' && item.runtimeTicks > 0) {
    const runtimeMinutes = Math.round(item.runtimeTicks / 600000000);
    return `${runtimeMinutes} min`;
  }
  return '';
}

export function LibraryItemsPage({
  libraryName,
  sortMode,
  onSortModeChange,
  items,
}: LibraryItemsPageProps) {
  const activeSortOption = SORT_OPTIONS.find((opt) => opt.value === sortMode);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <section className="library-view-container">
      {/* TOP HEADER BAR */}
      <header className="library-top-bar">
        <div className="library-top-bar__left">
          <span 
            className={`library-top-bar__current-sort ${isSidebarOpen ? 'active' : ''}`}
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          >
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/></svg>
            {activeSortOption?.label} {isSidebarOpen ? '↑' : '↓'}
          </span>
        </div>
        <div className="library-top-bar__right">
          <button className="library-icon-btn" aria-label="Grid view">
            <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M4 11h5V5H4v6zm0 7h5v-6H4v6zm6 0h5v-6h-5v6zm6 0h5v-6h-5v6zm-6-14v6h5V5h-5zm6 0v6h5V5h-5z"/></svg>
          </button>
          <button className="library-icon-btn" aria-label="Filter">
            <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/></svg>
          </button>
          <button className="library-icon-btn" aria-label="Shuffle">
            <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
          </button>
          <span className="library-item-count">{items.length} 项目</span>
        </div>
      </header>

      <div className="library-content-wrapper">
        {/* LEFT SIDEBAR DROPDOWN */}
        {isSidebarOpen && (
          <aside className="library-sidebar library-sidebar--dropdown">
            <nav>
              <ul className="library-sidebar-list">
                {SORT_OPTIONS.map((option) => {
                  const isActive = sortMode === option.value;
                  return (
                    <li key={option.value}>
                      <button
                        type="button"
                        className={`library-sort-btn ${isActive ? 'active' : ''}`}
                        aria-pressed={isActive}
                        onClick={() => {
                          if (!isActive) void onSortModeChange(option.value);
                          setIsSidebarOpen(false); // Close on selection
                        }}
                      >
                        {option.label}
                        {isActive && <span className="sort-arrow">↓</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>
        )}

        {/* MAIN GRID */}
        <main className="library-main-content">
          {items.length > 0 ? (
            <ul className="library-items-grid--dense">
              {items.map((item) => (
                <li key={item.id} className="library-grid-item">
                  <PosterCard
                    title={item.name}
                    subtitle={formatSubtitle(item)}
                    posterUrl={item.posterUrl}
                    imageCandidates={item.imageCandidates}
                    communityRating={item.communityRating}
                    productionYear={item.productionYear}
                    href={`/item/${item.id}`}
                    state={{ title: item.name, serverPositionTicks: item.serverPositionTicks }}
                  />
                  {/* Generic indexing badge top-left or top-right can be added here if needed, but the rating badge handles most of the aesthetics */}
                </li>
              ))}
            </ul>
          ) : (
            <p className="library-empty">未找到项目。</p>
          )}
        </main>
      </div>
    </section>
  );
}
