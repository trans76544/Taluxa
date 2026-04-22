import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@renderer/features/auth/AuthContext';
import { SettingsPage } from './SettingsPage';

describe('SettingsPage', () => {
  it('shows the saved server url, lets you rename the active server, and keeps the logout action', async () => {
    const onLogout = vi.fn();
    const onServerDisplayNameSave = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <AuthProvider initialState={{ accounts: [], activeAccountId: null }}>
          <SettingsPage
            userName="Alice"
            serverUrl="https://demo.emby.local"
            serverDisplayName="Living Room Server"
            defaultVolume={0.8}
            onServerDisplayNameSave={onServerDisplayNameSave}
            onLogout={onLogout}
          />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('Active account').nextElementSibling).toHaveTextContent('Alice');
    expect(screen.getByText('https://demo.emby.local')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Server display name'), {
      target: { value: 'Projector Server' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save server name' }));

    expect(onServerDisplayNameSave).toHaveBeenCalledWith('Projector Server');

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
