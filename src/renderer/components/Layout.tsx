import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@renderer/features/auth/AuthContext';
import { AccountSidebar } from './AccountSidebar';

interface LayoutProps {
  children: ReactNode;
  sidebar?: ReactNode;
  title?: string;
}

export function Layout({ children, sidebar, title = 'Emby Player' }: LayoutProps) {
  const navigate = useNavigate();
  const { accounts, activeAccountId, session, setActiveAccountId } = useAuth();

  async function handleSelectAccount(nextAccountId: string) {
    if (
      nextAccountId === activeAccountId ||
      !accounts.some((account) => account.id === nextAccountId)
    ) {
      return;
    }

    try {
      await window.embyDesktop?.storage?.write?.({
        activeAccountId: nextAccountId,
      });
    } catch {
      // Persisting the selected account is best-effort.
    }

    setActiveAccountId(nextAccountId);
    navigate('/libraries');
  }

  const resolvedSidebar =
    sidebar ??
    (session && accounts.length > 0 ? (
      <AccountSidebar
        accounts={accounts}
        activeAccountId={activeAccountId}
        onSelectAccount={handleSelectAccount}
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
