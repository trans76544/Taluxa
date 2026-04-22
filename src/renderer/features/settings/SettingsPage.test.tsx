import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@renderer/features/auth/AuthContext';
import { SettingsPage } from './SettingsPage';

describe('SettingsPage', () => {
  it('shows the saved server url and logout action', () => {
    const onLogout = vi.fn();

    render(
      <MemoryRouter>
        <AuthProvider initialState={{ accounts: [], activeAccountId: null }}>
          <SettingsPage
            userName="Alice"
            serverUrl="https://demo.emby.local"
            defaultVolume={0.8}
            onLogout={onLogout}
          />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('Active account').nextElementSibling).toHaveTextContent('Alice');
    expect(screen.getByText('https://demo.emby.local')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
