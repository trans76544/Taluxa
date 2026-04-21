import { Link } from 'react-router-dom';
import type { SavedAccount } from '@shared/models/session';

interface AccountSidebarProps {
  accounts: SavedAccount[];
  activeAccountId: string | null;
  onSelectAccount: (accountId: string) => void;
}

function groupAccountsByServer(accounts: SavedAccount[]) {
  const accountsByServer = new Map<string, SavedAccount[]>();

  for (const account of accounts) {
    const serverAccounts = accountsByServer.get(account.serverUrl);

    if (serverAccounts) {
      serverAccounts.push(account);
      continue;
    }

    accountsByServer.set(account.serverUrl, [account]);
  }

  return Array.from(accountsByServer.entries());
}

export function AccountSidebar({
  accounts,
  activeAccountId,
  onSelectAccount,
}: AccountSidebarProps) {
  const groupedAccounts = groupAccountsByServer(accounts);

  return (
    <div className="account-sidebar">
      <div className="account-sidebar__intro">
        <p className="eyebrow">Emby Player</p>
        <p className="account-sidebar__title">Accounts</p>
        <p className="account-sidebar__description">Switch between saved users and servers.</p>
      </div>

      <nav aria-label="Saved accounts" className="account-sidebar__sections">
        {groupedAccounts.map(([serverUrl, serverAccounts]) => (
          <section className="account-sidebar__section" key={serverUrl}>
            <h2>{serverUrl}</h2>

            <div className="account-sidebar__accounts">
              {serverAccounts.map((account) => {
                const isActive = account.id === activeAccountId;

                return (
                  <button
                    key={account.id}
                    className={`account-sidebar__account${isActive ? ' is-active' : ''}`}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => onSelectAccount(account.id)}
                  >
                    {account.userName}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </nav>

      <div className="account-sidebar__footer">
        <Link to="/login">Add account</Link>
        <Link to="/settings">Settings</Link>
      </div>
    </div>
  );
}
