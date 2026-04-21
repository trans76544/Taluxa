import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface LayoutProps {
  children: ReactNode;
  title?: string;
}

export function Layout({ children, title = 'Emby Player' }: LayoutProps) {
  return (
    <main className="shell">
      <section className="panel">
        <header className="stack">
          <div>
            <p className="eyebrow">Emby Player</p>
            <h1>{title}</h1>
          </div>

          <nav aria-label="Primary" className="layout-nav">
            <Link to="/libraries">Libraries</Link>
            <Link to="/settings">Settings</Link>
          </nav>
        </header>

        {children}
      </section>
    </main>
  );
}
