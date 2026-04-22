import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@renderer/features/auth/AuthContext';
import { SettingsPage } from './SettingsPage';

describe('SettingsPage', () => {
  function renderSettingsPage({
    onLogout = vi.fn(),
    onProxySettingsSave = vi.fn().mockResolvedValue(undefined),
    onServerDisplayNameSave = vi.fn().mockResolvedValue(undefined),
    proxyMode = 'system',
    customProxyUrl = '',
  }: {
    onLogout?: ReturnType<typeof vi.fn>;
    onProxySettingsSave?: ReturnType<typeof vi.fn>;
    onServerDisplayNameSave?: ReturnType<typeof vi.fn>;
    proxyMode?: 'system' | 'direct' | 'custom';
    customProxyUrl?: string;
  } = {}) {
    render(
      <MemoryRouter>
        <AuthProvider initialState={{ accounts: [], activeAccountId: null }}>
          <SettingsPage
            userName="Alice"
            serverUrl="https://demo.emby.local"
            serverDisplayName="Living Room Server"
            defaultVolume={0.8}
            proxyMode={proxyMode}
            customProxyUrl={customProxyUrl}
            onProxySettingsSave={onProxySettingsSave}
            onServerDisplayNameSave={onServerDisplayNameSave}
            onLogout={onLogout}
          />
        </AuthProvider>
      </MemoryRouter>
    );

    return {
      onLogout,
      onProxySettingsSave,
      onServerDisplayNameSave,
    };
  }

  it('shows the saved server url, lets you rename the active server, and keeps the logout action', async () => {
    const { onLogout, onServerDisplayNameSave } = renderSettingsPage();

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

  it('keeps a dirty server rename draft when async display name props change', () => {
    const onProxySettingsSave = vi.fn().mockResolvedValue(undefined);
    const onServerDisplayNameSave = vi.fn().mockResolvedValue(undefined);
    const onLogout = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <AuthProvider initialState={{ accounts: [], activeAccountId: null }}>
          <SettingsPage
            userName="Alice"
            serverUrl="https://demo.emby.local"
            serverDisplayName="https://demo.emby.local"
            defaultVolume={0.8}
            proxyMode="system"
            customProxyUrl=""
            onProxySettingsSave={onProxySettingsSave}
            onServerDisplayNameSave={onServerDisplayNameSave}
            onLogout={onLogout}
          />
        </AuthProvider>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Server display name'), {
      target: { value: 'Projector Server' },
    });

    rerender(
      <MemoryRouter>
        <AuthProvider initialState={{ accounts: [], activeAccountId: null }}>
          <SettingsPage
            userName="Alice"
            serverUrl="https://demo.emby.local"
            serverDisplayName="Living Room Server"
            defaultVolume={0.8}
            proxyMode="system"
            customProxyUrl=""
            onProxySettingsSave={onProxySettingsSave}
            onServerDisplayNameSave={onServerDisplayNameSave}
            onLogout={onLogout}
          />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByLabelText('Server display name')).toHaveValue('Projector Server');
  });

  it('shows an inline error when saving the server display name fails', async () => {
    const onServerDisplayNameSave = vi.fn().mockRejectedValue(new Error('disk full'));
    renderSettingsPage({ onServerDisplayNameSave });

    fireEvent.change(screen.getByLabelText('Server display name'), {
      target: { value: 'Projector Server' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save server name' }));

    expect(onServerDisplayNameSave).toHaveBeenCalledWith('Projector Server');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save the server name. Try again.'
    );
  });

  it('hides the custom proxy url input unless proxy mode is custom', () => {
    renderSettingsPage({ proxyMode: 'system' });

    expect(screen.queryByLabelText('Custom proxy URL')).not.toBeInTheDocument();
  });

  it('selecting custom proxy reveals the input', () => {
    renderSettingsPage();

    fireEvent.click(screen.getByLabelText('Custom proxy'));

    expect(screen.getByLabelText('Custom proxy URL')).toBeInTheDocument();
  });

  it('invalid custom proxy save shows an inline error', async () => {
    const onProxySettingsSave = vi.fn().mockRejectedValue(new Error('invalid proxy'));
    renderSettingsPage({ onProxySettingsSave });

    fireEvent.click(screen.getByLabelText('Custom proxy'));
    fireEvent.change(screen.getByLabelText('Custom proxy URL'), {
      target: { value: 'notaurl' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save proxy settings' }));

    expect(onProxySettingsSave).toHaveBeenCalledWith({
      mode: 'custom',
      customProxyUrl: 'notaurl',
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save proxy settings. Check the proxy URL and try again.'
    );
  });
});
