import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AccountSidebar } from './AccountSidebar';

import type { SavedAccount } from '@shared/models/session';

function createAccount(overrides: Partial<SavedAccount> = {}): SavedAccount {
  const serverUrl = overrides.serverUrl ?? 'https://demo.emby.local';
  const userId = overrides.userId ?? 'user-1';

  return {
    id: overrides.id ?? `${serverUrl}::${userId}`,
    serverUrl,
    userId,
    userName: overrides.userName ?? 'Alice',
    accessToken: overrides.accessToken ?? 'token-123',
    lastUsedAt: overrides.lastUsedAt ?? '2026-04-21T00:00:00.000Z',
  };
}

describe('AccountSidebar', () => {
  it('renders the enlarged Taluxa brand logo without the product name', () => {
    render(
      <MemoryRouter>
        <AccountSidebar
          accounts={[createAccount()]}
          activeAccountId="https://demo.emby.local::user-1"
          serverDisplayNamesByUrl={{}}
          onSelectAccount={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('img', { name: 'Taluxa' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Taluxa' })).not.toBeInTheDocument();
  });

  it('prefers friendly server display names in the account switcher', () => {
    render(
      <MemoryRouter>
        <AccountSidebar
          accounts={[
            createAccount({
              id: 'https://alpha.emby.local::user-1',
              serverUrl: 'https://alpha.emby.local',
              userId: 'user-1',
              userName: 'Alice',
            }),
            createAccount({
              id: 'https://beta.emby.local::user-2',
              serverUrl: 'https://beta.emby.local',
              userId: 'user-2',
              userName: 'Bob',
            }),
            createAccount({
              id: 'https://alpha.emby.local::user-3',
              serverUrl: 'https://alpha.emby.local',
              userId: 'user-3',
              userName: 'Charlie',
            }),
          ]}
          activeAccountId="https://alpha.emby.local::user-3"
          serverDisplayNamesByUrl={{
            'https://alpha.emby.local': 'Living Room Server',
            'https://beta.emby.local': 'Bedroom Server',
          }}
          onSelectAccount={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getAllByText('Living Room Server')).toHaveLength(2);
    expect(screen.getByText('Bedroom Server')).toBeInTheDocument();
    expect(screen.queryByText('https://alpha.emby.local')).not.toBeInTheDocument();
    expect(screen.queryByText('https://beta.emby.local')).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: /Alice/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bob/ })).toBeInTheDocument();

    const activeButton = screen.getByRole('button', { name: /Charlie/ });
    expect(activeButton).toHaveClass('server-item', 'is-active');

    expect(screen.getByRole('link', { name: /收藏/ })).toHaveAttribute('href', '/libraries');
    expect(screen.getByRole('link', { name: /聚合视界/ })).toHaveAttribute('href', '/aggregate');
    expect(screen.getByRole('link', { name: /添加服务器/ })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: /设置/ })).toHaveAttribute('href', '/settings');
  });

  it('highlights the home nav item for the libraries home route', () => {
    render(
      <MemoryRouter initialEntries={['/libraries']}>
        <AccountSidebar
          accounts={[createAccount()]}
          activeAccountId="https://demo.emby.local::user-1"
          serverDisplayNamesByUrl={{}}
          onSelectAccount={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /首页/ })).toHaveClass('is-active');
    expect(screen.getByRole('link', { name: /收藏/ })).not.toHaveClass('is-active');
  });

  it('falls back to the raw server url when no friendly display name exists', () => {
    render(
      <MemoryRouter>
        <AccountSidebar
          accounts={[createAccount()]}
          activeAccountId="https://demo.emby.local::user-1"
          serverDisplayNamesByUrl={{}}
          onSelectAccount={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('https://demo.emby.local')).toBeInTheDocument();
    expect(screen.getAllByText('https://demo.emby.local')).toHaveLength(1);
  });

  it('calls onSelectAccount with the clicked account id', () => {
    const onSelectAccount = vi.fn();

    render(
      <MemoryRouter>
        <AccountSidebar
          accounts={[
            createAccount(),
            createAccount({
              id: 'https://demo.emby.local::user-2',
              userId: 'user-2',
              userName: 'Bob',
            }),
          ]}
          activeAccountId="https://demo.emby.local::user-1"
          serverDisplayNamesByUrl={{}}
          onSelectAccount={onSelectAccount}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Bob/ }));

    expect(onSelectAccount).toHaveBeenCalledWith('https://demo.emby.local::user-2');
  });

  it('calls onAddServer from the add server footer link', () => {
    const onAddServer = vi.fn();

    render(
      <MemoryRouter>
        <AccountSidebar
          accounts={[createAccount()]}
          activeAccountId="https://demo.emby.local::user-1"
          serverDisplayNamesByUrl={{}}
          onSelectAccount={vi.fn()}
          onAddServer={onAddServer}
        />
      </MemoryRouter>
    );

    const addServerLink = screen.getByRole('link', { name: /\+/ });

    expect(addServerLink).toHaveClass('footer-item');
    expect(addServerLink).not.toHaveClass('footer-item--add-server');
    expect(addServerLink).toHaveAttribute('href', '/login');
    expect(addServerLink.tagName).toBe(screen.getByRole('link', { name: /设置/ }).tagName);
    expect(addServerLink.className).toBe(screen.getByRole('link', { name: /设置/ }).className);

    fireEvent.click(addServerLink);

    expect(onAddServer).toHaveBeenCalledTimes(1);
  });

  it('opens server configuration from the server context menu', async () => {
    const onServerDisplayNameSave = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <AccountSidebar
          accounts={[createAccount()]}
          activeAccountId="https://demo.emby.local::user-1"
          serverDisplayNamesByUrl={{
            'https://demo.emby.local': 'Living Room Server',
          }}
          onSelectAccount={vi.fn()}
          {...({ onServerDisplayNameSave } as object)}
        />
      </MemoryRouter>
    );

    fireEvent.contextMenu(screen.getByRole('button', { name: /Living Room Server/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '修改备注' }));

    fireEvent.change(screen.getByLabelText('服务器备注'), {
      target: { value: 'Projector Server' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存服务器备注' }));

    await waitFor(() =>
      expect(onServerDisplayNameSave).toHaveBeenCalledWith(
        'https://demo.emby.local',
        'Projector Server'
      )
    );
  });
});
