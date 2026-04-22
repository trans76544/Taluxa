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
  it('prefers friendly server display names and shows the raw url as secondary text', () => {
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

    const alphaHeading = screen.getByRole('heading', { name: 'Living Room Server' });
    const betaHeading = screen.getByRole('heading', { name: 'Bedroom Server' });

    expect(alphaHeading).toBeInTheDocument();
    expect(betaHeading).toBeInTheDocument();
    expect(screen.getByText('https://alpha.emby.local')).toBeInTheDocument();
    expect(screen.getByText('https://beta.emby.local')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2);

    expect(screen.getByRole('button', { name: 'Alice' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bob' })).toBeInTheDocument();

    const activeButton = screen.getByRole('button', { name: 'Charlie' });
    expect(activeButton).toHaveClass('account-sidebar__account', 'is-active');

    expect(screen.getByRole('link', { name: 'Libraries' })).toHaveAttribute('href', '/libraries');
    expect(screen.getByRole('link', { name: 'Add account' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
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

    expect(
      screen.getByRole('heading', { name: 'https://demo.emby.local' })
    ).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: 'Bob' }));

    expect(onSelectAccount).toHaveBeenCalledWith('https://demo.emby.local::user-2');
  });
});
