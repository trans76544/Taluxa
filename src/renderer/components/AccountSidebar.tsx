import { Link } from 'react-router-dom';
import type { SavedAccount } from '@shared/models/session';

interface AccountSidebarProps {
  accounts: SavedAccount[];
  activeAccountId: string | null;
  serverDisplayNamesByUrl: Record<string, string>;
  onSelectAccount: (accountId: string) => void | Promise<void>;
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
  serverDisplayNamesByUrl,
  onSelectAccount,
}: AccountSidebarProps) {
  const groupedAccounts = groupAccountsByServer(accounts);

  return (
    <div className="account-sidebar">
      <div className="account-sidebar__brand">
        <h1 className="brand-title">Hills Lite</h1>
        <div className="search-bar">
          <span className="search-icon">🔍</span>
          <input type="text" placeholder="搜索" className="search-input" />
        </div>
      </div>

      <nav className="account-sidebar__main-nav">
        <Link to="/" className="nav-item is-active">
          <span className="nav-icon">🏠</span>
          <span>首页</span>
        </Link>
        <Link to="/libraries" className="nav-item">
          <span className="nav-icon">❤️</span>
          <span>收藏</span>
        </Link>
        <Link to="/libraries" className="nav-item">
          <span className="nav-icon">♾️</span>
          <span>聚合视界</span>
        </Link>
      </nav>

      <div className="account-sidebar__servers-section">
        <h2 className="section-title">服务器</h2>
        <div className="account-sidebar__servers-list">
          {accounts.map((account) => {
            const isActive = account.id === activeAccountId;
            const serverDisplayName = serverDisplayNamesByUrl[account.serverUrl]?.trim() || account.serverUrl;
            
            return (
              <button
                key={account.id}
                className={`server-item ${isActive ? 'is-active' : ''}`}
                type="button"
                aria-pressed={isActive}
                onClick={() => onSelectAccount(account.id)}
              >
                <div className="server-item__icon">
                  <span className="play-icon">▶</span>
                </div>
                <div className="server-item__info">
                  <span className="server-item__name">{serverDisplayName}</span>
                  <span className="server-item__status">
                    {account.userName} ({new Date(account.lastUsedAt).toLocaleDateString()} 登录过)
                  </span>
                </div>
                <div className="server-item__action">=</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="account-sidebar__footer">
        <Link to="/login" className="footer-item">
          <span className="nav-icon">+</span>
          <span>添加服务器</span>
        </Link>
        <Link to="/settings" className="footer-item">
          <span className="nav-icon">⚙️</span>
          <span>设置</span>
        </Link>
      </div>
    </div>
  );
}
