import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { SavedAccount } from '@shared/models/session';
import logoUrl from '../../../sources/logo.png';

interface AccountSidebarProps {
  accounts: SavedAccount[];
  activeAccountId: string | null;
  serverDisplayNamesByUrl: Record<string, string>;
  onSelectAccount: (accountId: string) => void | Promise<void>;
  onServerDisplayNameSave?: (serverUrl: string, nextName: string) => void | Promise<void>;
}

interface ServerContextMenuState {
  displayName: string;
  serverUrl: string;
  x: number;
  y: number;
}

interface ServerEditorState {
  displayName: string;
  serverUrl: string;
}

export function AccountSidebar({
  accounts,
  activeAccountId,
  serverDisplayNamesByUrl,
  onSelectAccount,
  onServerDisplayNameSave,
}: AccountSidebarProps) {
  const [serverContextMenu, setServerContextMenu] = useState<ServerContextMenuState | null>(null);
  const [serverEditor, setServerEditor] = useState<ServerEditorState | null>(null);
  const [serverDisplayNameDraft, setServerDisplayNameDraft] = useState('');
  const [serverDisplayNameSaveError, setServerDisplayNameSaveError] = useState('');

  function openServerEditor(server: ServerEditorState) {
    setServerContextMenu(null);
    setServerEditor(server);
    setServerDisplayNameDraft(server.displayName);
    setServerDisplayNameSaveError('');
  }

  async function handleServerDisplayNameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!serverEditor || !onServerDisplayNameSave) {
      return;
    }

    try {
      await onServerDisplayNameSave(serverEditor.serverUrl, serverDisplayNameDraft.trim());
      setServerEditor(null);
      setServerDisplayNameSaveError('');
    } catch {
      setServerDisplayNameSaveError('无法保存服务器备注，请稍后重试。');
    }
  }

  return (
    <div className="account-sidebar" onClick={() => setServerContextMenu(null)}>
      <div className="account-sidebar__brand">
        <div className="brand-lockup">
          <img className="brand-logo" src={logoUrl} alt="Taluxa" />
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
                onContextMenu={(event) => {
                  if (!onServerDisplayNameSave) {
                    return;
                  }

                  event.preventDefault();
                  setServerContextMenu({
                    displayName: serverDisplayName,
                    serverUrl: account.serverUrl,
                    x: event.clientX,
                    y: event.clientY,
                  });
                }}
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

      {serverContextMenu ? (
        <div
          className="server-context-menu"
          role="menu"
          style={{
            left: serverContextMenu.x,
            top: serverContextMenu.y,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => openServerEditor(serverContextMenu)}
          >
            <span aria-hidden="true">✎</span>
            <span>修改备注</span>
          </button>
        </div>
      ) : null}

      {serverEditor ? (
        <div className="server-editor-backdrop" onClick={() => setServerEditor(null)}>
          <form
            className="server-editor-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="server-editor-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => void handleServerDisplayNameSubmit(event)}
          >
            <div className="server-editor-dialog__header">
              <h3 id="server-editor-title">修改服务器备注</h3>
              <button
                type="button"
                aria-label="关闭服务器备注编辑"
                onClick={() => setServerEditor(null)}
              >
                ×
              </button>
            </div>
            <label>
              <span>服务器备注</span>
              <input
                type="text"
                value={serverDisplayNameDraft}
                onChange={(event) => {
                  setServerDisplayNameDraft(event.target.value);
                  setServerDisplayNameSaveError('');
                }}
              />
            </label>
            <p className="server-editor-dialog__url">{serverEditor.serverUrl}</p>
            <div className="server-editor-dialog__actions">
              <button type="button" onClick={() => setServerEditor(null)}>
                取消
              </button>
              <button type="submit" aria-label="保存服务器备注">
                保存
              </button>
            </div>
            {serverDisplayNameSaveError ? (
              <p role="alert">{serverDisplayNameSaveError}</p>
            ) : null}
          </form>
        </div>
      ) : null}

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
