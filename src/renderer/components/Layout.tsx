import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@renderer/features/auth/AuthContext';
import { AccountSidebar } from './AccountSidebar';
import { AppTitleBar } from './AppTitleBar';

interface LayoutProps {
  children: ReactNode;
  sidebar?: ReactNode;
  title?: string;
}

export function Layout({ children, sidebar, title = 'Taluxa' }: LayoutProps) {
  const navigate = useNavigate();
  const { accounts, activeAccountId, getServerDisplayName, session, setActiveAccountId } =
    useAuth();

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
    navigate('/libraries', { replace: true });
  }

  const serverDisplayNamesByUrl: Record<string, string> = {};

  for (const account of accounts) {
    serverDisplayNamesByUrl[account.serverUrl] = getServerDisplayName(account.serverUrl);
  }

  const resolvedSidebar =
    sidebar ??
    (session && accounts.length > 0 ? (
      <AccountSidebar
        accounts={accounts}
        activeAccountId={activeAccountId}
        serverDisplayNamesByUrl={serverDisplayNamesByUrl}
        onSelectAccount={handleSelectAccount}
      />
    ) : null);

  if (!resolvedSidebar) {
    return (
      <div className="desktop-shell">
        <AppTitleBar title={title} />
        <main className="app-layout app-layout--no-sidebar">
          <section className="app-main">{children}</section>
        </main>
      </div>
    );
  }

  return (
    <div className="desktop-shell">
      <AppTitleBar title="Taluxa" />
      <main className="app-layout">
        <aside className="app-sidebar">{resolvedSidebar}</aside>

        <section className="app-main">{children}</section>
      </main>
    </div>
  );
}
