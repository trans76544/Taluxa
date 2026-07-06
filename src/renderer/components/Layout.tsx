import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@renderer/features/auth/AuthContext';
import { LoginPage } from '@renderer/features/auth/LoginPage';
import { useLoginFlow } from '@renderer/features/auth/useLoginFlow';
import { AccountSidebar } from './AccountSidebar';
import { AppTitleBar } from './AppTitleBar';

interface LayoutProps {
  children: ReactNode;
  sidebar?: ReactNode;
  title?: string;
}

export function Layout({ children, sidebar, title = 'Taluxa' }: LayoutProps) {
  const navigate = useNavigate();
  const { accounts, activeAccountId, getServerDisplayName, session, setActiveAccountId, updateSettings } =
    useAuth();
  const [isAddServerDialogOpen, setIsAddServerDialogOpen] = useState(false);
  const {
    accounts: loginAccounts,
    errorMessage: addServerErrorMessage,
    handleSubmit: handleAddServerSubmit,
    setErrorMessage: setAddServerErrorMessage,
  } = useLoginFlow({
    onSuccess: () => setIsAddServerDialogOpen(false),
  });

  function openAddServerDialog() {
    setAddServerErrorMessage('');
    setIsAddServerDialogOpen(true);
  }

  const addServerDialog = isAddServerDialogOpen ? (
    <div className="add-server-backdrop" onClick={() => setIsAddServerDialogOpen(false)}>
      <div
        className="add-server-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Add server"
        style={{ opacity: 0.75 }}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="add-server-dialog__close"
          aria-label="Close add server"
          onClick={() => setIsAddServerDialogOpen(false)}
        >
          x
        </button>
        <LoginPage
          onSubmit={handleAddServerSubmit}
          hasRememberedAccounts={loginAccounts.length > 0}
          presentation="embedded"
        />
        {addServerErrorMessage ? <p role="alert">{addServerErrorMessage}</p> : null}
      </div>
    </div>
  ) : null;

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

  async function handleServerDisplayNameSave(serverUrl: string, nextName: string) {
    if (!serverUrl) {
      return;
    }

    const settingsPatch = {
      serverPreferencesByUrl: {
        [serverUrl]: {
          displayNameOverride: nextName,
        },
      },
    };

    await window.embyDesktop?.storage?.write?.({
      settings: settingsPatch,
    });
    updateSettings(settingsPatch);
  }

  const serverDisplayNamesByUrl: Record<string, string> = {};

  for (const account of accounts) {
    serverDisplayNamesByUrl[account.serverUrl] = getServerDisplayName(account.serverUrl);
  }

  const resolvedSidebar =
    sidebar !== undefined
      ? sidebar
      : session && accounts.length > 0 ? (
      <AccountSidebar
        accounts={accounts}
        activeAccountId={activeAccountId}
        serverDisplayNamesByUrl={serverDisplayNamesByUrl}
        onAddServer={openAddServerDialog}
        onSelectAccount={handleSelectAccount}
        onServerDisplayNameSave={handleServerDisplayNameSave}
      />
      ) : null;

  if (!resolvedSidebar) {
    return (
      <div className="desktop-shell">
        <AppTitleBar title={title} />
        <main className="app-layout app-layout--no-sidebar">
          <section className="app-main">
            {children}
            {addServerDialog}
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="desktop-shell">
      <AppTitleBar title="Taluxa" />
      <main className="app-layout">
        <aside className="app-sidebar">{resolvedSidebar}</aside>

        <section className="app-main">
          {children}
          {addServerDialog}
        </section>
      </main>
    </div>
  );
}
