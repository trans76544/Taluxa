import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@renderer/features/auth/AuthContext';
import { SettingsPage } from './SettingsPage';
import type {
  CacheSettings,
  DanmakuServerSettings,
  DanmakuSettings,
} from '@shared/models/settings';

describe('SettingsPage', () => {
  function renderSettingsPage({
    onLogout = vi.fn(),
    onProxySettingsSave = vi.fn().mockResolvedValue(undefined),
    onDanmakuServersSave = vi.fn().mockResolvedValue(undefined),
    onDanmakuSettingsSave = vi.fn().mockResolvedValue(undefined),
    onCacheSettingsSave = vi.fn().mockResolvedValue(undefined),
    onClearDataCache = vi.fn().mockResolvedValue(undefined),
    onClearImageCache = vi.fn().mockResolvedValue(undefined),
    proxyMode = 'system',
    customProxyUrl = '',
    danmakuServers = [],
    danmakuSettings = {
      enabled: true,
      scrollMaxLines: 5,
      topMaxLines: 3,
      bottomMaxLines: 3,
      scale: 1,
      opacity: 0.5,
      speed: 1,
      bold: false,
      blocklist: [],
      matchMode: 'fileName',
      conversionMode: 'off',
    },
    cacheSettings = {
      dataCacheEnabled: true,
      dataCacheTtlDays: 30,
      imageCacheEnabled: true,
      imageCacheMaxBytes: 524288000,
      imageCacheResolution: 'original',
    },
    dataCacheBytes = 1024,
    imageCacheBytes = 2048,
  }: {
    onLogout?: ReturnType<typeof vi.fn>;
    onProxySettingsSave?: ReturnType<typeof vi.fn>;
    onDanmakuServersSave?: ReturnType<typeof vi.fn>;
    onDanmakuSettingsSave?: ReturnType<typeof vi.fn>;
    onCacheSettingsSave?: ReturnType<typeof vi.fn>;
    onClearDataCache?: ReturnType<typeof vi.fn>;
    onClearImageCache?: ReturnType<typeof vi.fn>;
    proxyMode?: 'system' | 'direct' | 'custom';
    customProxyUrl?: string;
    danmakuServers?: DanmakuServerSettings[];
    danmakuSettings?: DanmakuSettings;
    cacheSettings?: CacheSettings;
    dataCacheBytes?: number;
    imageCacheBytes?: number;
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
            danmakuSettings={danmakuSettings}
            cacheSettings={cacheSettings}
            dataCacheBytes={dataCacheBytes}
            imageCacheBytes={imageCacheBytes}
            onCacheSettingsSave={onCacheSettingsSave}
            onClearDataCache={onClearDataCache}
            onClearImageCache={onClearImageCache}
            onProxySettingsSave={onProxySettingsSave}
            onDanmakuServersSave={onDanmakuServersSave}
            onDanmakuSettingsSave={onDanmakuSettingsSave}
            onLogout={onLogout}
          />
        </AuthProvider>
      </MemoryRouter>
    );

    return {
      onLogout,
      onCacheSettingsSave,
      onClearDataCache,
      onClearImageCache,
      onDanmakuServersSave,
      onDanmakuSettingsSave,
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
    expect(screen.queryByText('记忆手动选择的弹幕')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit danmaku API servers' }));
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

    await waitFor(() =>
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
      ])
    );
  });

  it('saves compact danmaku display settings from row controls', () => {
    const onDanmakuSettingsSave = vi.fn().mockResolvedValue(undefined);
    renderSettingsPage({ onDanmakuSettingsSave });

    fireEvent.click(screen.getByLabelText('Enable danmaku'));
    expect(onDanmakuSettingsSave).toHaveBeenCalledWith({
      enabled: false,
      scrollMaxLines: 5,
      topMaxLines: 3,
      bottomMaxLines: 3,
      scale: 1,
      opacity: 0.5,
      speed: 1,
      bold: false,
      blocklist: [],
      matchMode: 'fileName',
      conversionMode: 'off',
    });

    fireEvent.change(screen.getByLabelText('Scrolling danmaku max lines'), {
      target: { value: '8' },
    });
    expect(onDanmakuSettingsSave).toHaveBeenCalledWith(
      expect.objectContaining({ scrollMaxLines: 8 })
    );

    fireEvent.change(screen.getByLabelText('Danmaku opacity'), {
      target: { value: '75' },
    });
    expect(onDanmakuSettingsSave).toHaveBeenCalledWith(
      expect.objectContaining({ opacity: 0.75 })
    );

    fireEvent.click(screen.getByLabelText('Bold danmaku'));
    expect(onDanmakuSettingsSave).toHaveBeenCalledWith(expect.objectContaining({ bold: true }));

    fireEvent.change(screen.getByLabelText('Danmaku match mode'), {
      target: { value: 'hashAndFileName' },
    });
    expect(onDanmakuSettingsSave).toHaveBeenCalledWith(
      expect.objectContaining({ matchMode: 'hashAndFileName' })
    );
  });

  it('renders media cache controls and saves cache option changes', () => {
    const { onCacheSettingsSave } = renderSettingsPage();

    expect(screen.getByRole('heading', { name: '媒体库' })).toBeInTheDocument();
    expect(screen.getByText('1 KB')).toBeInTheDocument();
    expect(screen.getByText('2 KB')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Data cache'));
    expect(onCacheSettingsSave).toHaveBeenCalledWith({
      dataCacheEnabled: false,
      dataCacheTtlDays: 30,
      imageCacheEnabled: true,
      imageCacheMaxBytes: 524288000,
      imageCacheResolution: 'original',
    });

    fireEvent.change(screen.getByLabelText('Data cache expiration'), {
      target: { value: '7' },
    });
    expect(onCacheSettingsSave).toHaveBeenCalledWith({
      dataCacheEnabled: true,
      dataCacheTtlDays: 7,
      imageCacheEnabled: true,
      imageCacheMaxBytes: 524288000,
      imageCacheResolution: 'original',
    });

    fireEvent.click(screen.getByLabelText('Image cache'));
    expect(onCacheSettingsSave).toHaveBeenCalledWith({
      dataCacheEnabled: true,
      dataCacheTtlDays: 30,
      imageCacheEnabled: false,
      imageCacheMaxBytes: 524288000,
      imageCacheResolution: 'original',
    });

    fireEvent.change(screen.getByLabelText('Image cache limit'), {
      target: { value: '104857600' },
    });
    expect(onCacheSettingsSave).toHaveBeenCalledWith({
      dataCacheEnabled: true,
      dataCacheTtlDays: 30,
      imageCacheEnabled: true,
      imageCacheMaxBytes: 104857600,
      imageCacheResolution: 'original',
    });

    fireEvent.change(screen.getByLabelText('Image cache resolution'), {
      target: { value: '720' },
    });
    expect(onCacheSettingsSave).toHaveBeenCalledWith({
      dataCacheEnabled: true,
      dataCacheTtlDays: 30,
      imageCacheEnabled: true,
      imageCacheMaxBytes: 524288000,
      imageCacheResolution: 720,
    });
  });

  it('clears data and image caches from the media settings section', () => {
    const { onClearDataCache, onClearImageCache } = renderSettingsPage();

    fireEvent.click(screen.getByRole('button', { name: 'Clear data cache' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear image cache' }));

    expect(onClearDataCache).toHaveBeenCalledTimes(1);
    expect(onClearImageCache).toHaveBeenCalledTimes(1);
  });
});
