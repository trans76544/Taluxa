import type { ReactNode } from 'react';
import { useAuth } from '@renderer/features/auth/AuthContext';
import { AccountSidebar } from './AccountSidebar';

interface LayoutProps {
  children: ReactNode;
  sidebar?: ReactNode;
  title?: string;
}

export function Layout({ children, sidebar, title = 'Emby Player' }: LayoutProps) {
  const { accounts, activeAccountId, session, setActiveAccountId } = useAuth();
  const resolvedSidebar =
    sidebar ??
    (session && accounts.length > 0 ? (
      <AccountSidebar
        accounts={accounts}
        activeAccountId={activeAccountId}
        onSelectAccount={setActiveAccountId}
      />
    ) : null);

  if (!resolvedSidebar) {
    return (
      <main className="shell">
        <section className="panel">
          <header className="layout-header">
            <div>
              <p className="eyebrow">Emby Player</p>
              <h1>{title}</h1>
            </div>
          </header>

          {children}
        </section>
      </main>
    );
  }

  return (
    <main className="shell shell--app">
      <aside className="shell-sidebar">{resolvedSidebar}</aside>

      <section className="shell-content">
        <div className="panel panel--content">
          <header className="layout-header">
            <div>
              <p className="eyebrow">Emby Player</p>
              <h1>{title}</h1>
            </div>
          </header>

          {children}
        </div>
      </section>
    </main>
  );
}
