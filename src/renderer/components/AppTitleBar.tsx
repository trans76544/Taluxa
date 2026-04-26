import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface AppTitleBarProps {
  title?: string;
}

export function AppTitleBar({ title = 'Taluxa' }: AppTitleBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (location.pathname !== '/search') {
      return;
    }

    setQuery(new URLSearchParams(location.search).get('q') ?? '');
  }, [location.pathname, location.search]);

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      return;
    }

    navigate(`/search?q=${encodeURIComponent(trimmedQuery)}`);
  }

  return (
    <header className="app-titlebar">
      <div className="app-titlebar__left">
        <button
          className="app-titlebar__icon-button"
          type="button"
          aria-label="返回"
          onClick={() => navigate(-1)}
        >
          ←
        </button>
        <strong className="app-titlebar__title">{title}</strong>
      </div>

      <form className="app-titlebar__search" role="search" aria-label="全局搜索" onSubmit={handleSearchSubmit}>
        <span aria-hidden="true">⌕</span>
        <input
          aria-label="搜索"
          type="search"
          placeholder="搜索"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </form>

      <div className="app-titlebar__window-controls">
        <button
          className="app-titlebar__window-button"
          type="button"
          aria-label="最小化"
          onClick={() => window.embyDesktop?.windowControls?.minimize?.()}
        >
          −
        </button>
        <button
          className="app-titlebar__window-button"
          type="button"
          aria-label="最大化"
          onClick={() => window.embyDesktop?.windowControls?.maximize?.()}
        >
          □
        </button>
        <button
          className="app-titlebar__window-button app-titlebar__window-button--close"
          type="button"
          aria-label="关闭"
          onClick={() => window.embyDesktop?.windowControls?.close?.()}
        >
          ×
        </button>
      </div>
    </header>
  );
}
