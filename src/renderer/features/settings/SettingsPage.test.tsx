import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@renderer/features/auth/AuthContext';
import { SettingsPage } from './SettingsPage';
import type { DanmakuServerSettings } from '@shared/models/settings';

describe('SettingsPage', () => {
  function renderSettingsPage({
    onLogout = vi.fn(),
    onProxySettingsSave = vi.fn().mockResolvedValue(undefined),
    onDanmakuServersSave = vi.fn().mockResolvedValue(undefined),
    proxyMode = 'system',
    customProxyUrl = '',
    danmakuServers = [],
  }: {
    onLogout?: ReturnType<typeof vi.fn>;
    onProxySettingsSave?: ReturnType<typeof vi.fn>;
    onDanmakuServersSave?: ReturnType<typeof vi.fn>;
    proxyMode?: 'system' | 'direct' | 'custom';
    customProxyUrl?: string;
    danmakuServers?: DanmakuServerSettings[];
  } = {}) {
    render(
      <MemoryRouter>
        <AuthProvider initialState={{ accounts: [], activeAccountId: null }}>
          <SettingsPage
            userName="Alice"
            serverUrl="https://demo.emby.local"
            defaultVolume={0.8}
            proxyMode={proxyMode}
            customProxyUrl={customProxyUrl}
            danmakuServers={danmakuServers}
            onProxySettingsSave={onProxySettingsSave}
            onDanmakuServersSave={onDanmakuServersSave}
            onLogout={onLogout}
          />
        </AuthProvider>
      </MemoryRouter>
    );

    return {
      onLogout,
      onDanmakuServersSave,
      onProxySettingsSave,
    };
  }

  it('shows the saved server url without server naming controls and keeps the logout action', () => {
    const { onLogout } = renderSettingsPage();

    expect(screen.getByRole('heading', { name: '设置' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '通用' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '网络与账户' })).toBeInTheDocument();
    expect(screen.queryByText('Hills Lite Pro')).not.toBeInTheDocument();
    expect(screen.getByText('当前账户')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('https://demo.emby.local')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.queryByLabelText('Server display name')).not.toBeInTheDocument();
    expect(screen.queryByText('服务器显示名称')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(onLogout).toHaveBeenCalledTimes(1);
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

  it('adds and saves multiple dandanplay-compatible danmaku servers', async () => {
    const onDanmakuServersSave = vi.fn().mockResolvedValue(undefined);
    renderSettingsPage({
      onDanmakuServersSave,
      danmakuServers: [
        {
          id: 'official',
          name: 'Official',
          url: 'https://api.dandanplay.net',
          enabled: true,
        },
      ],
    });

    expect(screen.getByRole('heading', { name: '弹幕' })).toBeInTheDocument();
    expect(screen.getByLabelText('Danmaku server name 1')).toHaveValue('Official');
    expect(screen.getByLabelText('Danmaku server URL 1')).toHaveValue(
      'https://api.dandanplay.net'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add danmaku server' }));
    fireEvent.change(screen.getByLabelText('Danmaku server name 2'), {
      target: { value: 'Misaka' },
    });
    fireEvent.change(screen.getByLabelText('Danmaku server URL 2'), {
      target: { value: 'http://127.0.0.1:7768' },
    });
    fireEvent.change(screen.getByLabelText('Danmaku AppId 2'), {
      target: { value: 'app-id' },
    });
    fireEvent.change(screen.getByLabelText('Danmaku AppSecret 2'), {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save danmaku servers' }));

    expect(onDanmakuServersSave).toHaveBeenCalledWith([
      {
        id: 'official',
        name: 'Official',
        url: 'https://api.dandanplay.net',
        appId: '',
        appSecret: '',
        enabled: true,
      },
      {
        id: expect.any(String),
        name: 'Misaka',
        url: 'http://127.0.0.1:7768',
        appId: 'app-id',
        appSecret: 'secret',
        enabled: true,
      },
    ]);
  });
});
