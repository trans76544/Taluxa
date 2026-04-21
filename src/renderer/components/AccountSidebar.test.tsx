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
  it('groups accounts by server, marks the active account, and renders footer links', () => {
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
          onSelectAccount={vi.fn()}
        />
      </MemoryRouter>
    );

    const alphaHeading = screen.getByRole('heading', { name: 'https://alpha.emby.local' });
    const betaHeading = screen.getByRole('heading', { name: 'https://beta.emby.local' });

    expect(alphaHeading).toBeInTheDocument();
    expect(betaHeading).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2);

    expect(screen.getByRole('button', { name: 'Alice' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bob' })).toBeInTheDocument();

    const activeButton = screen.getByRole('button', { name: 'Charlie' });
    expect(activeButton).toHaveClass('account-sidebar__account', 'is-active');

    expect(screen.getByRole('link', { name: 'Add account' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
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
          onSelectAccount={onSelectAccount}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Bob' }));

    expect(onSelectAccount).toHaveBeenCalledWith('https://demo.emby.local::user-2');
  });
});
