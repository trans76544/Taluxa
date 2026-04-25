import { fireEvent, render, screen } from '@testing-library/react';
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
  it('renders the Taluxa brand logo and product name', () => {
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
    expect(screen.getByRole('heading', { name: 'Taluxa' })).toBeInTheDocument();
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
    expect(screen.getByRole('link', { name: /添加服务器/ })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: /设置/ })).toHaveAttribute('href', '/settings');
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
});
