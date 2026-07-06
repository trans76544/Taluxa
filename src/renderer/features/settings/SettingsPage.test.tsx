import { readFileSync } from 'node:fs';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@renderer/features/auth/AuthContext';
import { SettingsPage } from './SettingsPage';
import { settingsRowIconIds } from './settingsIcons';
import type {
  CacheSettings,
  DanmakuServerSettings,
  DanmakuSettings,
  PlaybackSettings,
  SubtitleSettings,
} from '@shared/models/settings';

describe('SettingsPage', () => {
  function renderSettingsPage({
    onLogout = vi.fn(),
    onProxySettingsSave = vi.fn().mockResolvedValue(undefined),
    onDanmakuServersSave = vi.fn().mockResolvedValue(undefined),
    onDanmakuSettingsSave = vi.fn().mockResolvedValue(undefined),
    onPlaybackSettingsSave = vi.fn().mockResolvedValue(undefined),
    onSubtitleSettingsSave = vi.fn().mockResolvedValue(undefined),
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
    playbackSettings = {
      scaleMode: 'fit',
    },
    subtitleSettings = {
      enabled: true,
      fontFamily: 'Tahoma',
      delaySeconds: 0,
      fontSize: 55,
      position: 100,
      outline: 3,
      shadowOffset: 0,
      scale: 1,
      secondaryEnabled: false,
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
    onPlaybackSettingsSave?: ReturnType<typeof vi.fn>;
    onSubtitleSettingsSave?: ReturnType<typeof vi.fn>;
    onCacheSettingsSave?: ReturnType<typeof vi.fn>;
    onClearDataCache?: ReturnType<typeof vi.fn>;
    onClearImageCache?: ReturnType<typeof vi.fn>;
    proxyMode?: 'system' | 'direct' | 'custom';
    customProxyUrl?: string;
    danmakuServers?: DanmakuServerSettings[];
    danmakuSettings?: DanmakuSettings;
    playbackSettings?: PlaybackSettings;
    subtitleSettings?: SubtitleSettings;
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
            playbackSettings={playbackSettings}
            subtitleSettings={subtitleSettings}
            danmakuServers={danmakuServers}
            danmakuSettings={danmakuSettings}
            cacheSettings={cacheSettings}
            dataCacheBytes={dataCacheBytes}
            imageCacheBytes={imageCacheBytes}
            onCacheSettingsSave={onCacheSettingsSave}
            onClearDataCache={onClearDataCache}
            onClearImageCache={onClearImageCache}
            onProxySettingsSave={onProxySettingsSave}
            onPlaybackSettingsSave={onPlaybackSettingsSave}
            onSubtitleSettingsSave={onSubtitleSettingsSave}
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
      onPlaybackSettingsSave,
      onSubtitleSettingsSave,
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

  it('renders a unified decorative settings icon for every visible row', () => {
    renderSettingsPage();

    const collapsedIconIds = Object.entries(settingsRowIconIds)
      .filter(([rowId]) => rowId !== 'danmakuServerForm')
      .map(([, iconId]) => iconId);

    for (const iconId of collapsedIconIds) {
      const icon = screen.getByTestId(`settings-icon-${iconId}`);

      expect(icon).toHaveAttribute('aria-hidden', 'true');
      expect(icon.textContent?.trim()).toBe('');
      expect(icon.querySelector('svg')).not.toBeNull();
    }

    expect(screen.queryByTestId('settings-icon-danmakuServerForm')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit danmaku API servers' }));

    expect(screen.getByTestId('settings-icon-danmakuServerForm')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });

  it('saves playback scale mode from the media settings section', () => {
    const onPlaybackSettingsSave = vi.fn().mockResolvedValue(undefined);
    renderSettingsPage({ onPlaybackSettingsSave });

    fireEvent.change(screen.getByLabelText('Playback scale mode'), {
      target: { value: 'crop' },
    });

    expect(onPlaybackSettingsSave).toHaveBeenCalledWith({ scaleMode: 'crop' });
  });

  it('saves subtitle settings from Taluxa settings rows', () => {
    const onSubtitleSettingsSave = vi.fn().mockResolvedValue(undefined);
    renderSettingsPage({ onSubtitleSettingsSave });

    fireEvent.click(screen.getByLabelText('Enable subtitles'));
    expect(onSubtitleSettingsSave).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false })
    );

    fireEvent.change(screen.getByLabelText('Subtitle delay'), {
      target: { value: '1.5' },
    });
    expect(onSubtitleSettingsSave).toHaveBeenCalledWith(
      expect.objectContaining({ delaySeconds: 1.5 })
    );

    fireEvent.change(screen.getByLabelText('Subtitle font size'), {
      target: { value: '72' },
    });
    expect(onSubtitleSettingsSave).toHaveBeenCalledWith(
      expect.objectContaining({ fontSize: 72 })
    );

    fireEvent.click(screen.getByLabelText('Enable secondary subtitles'));
    expect(onSubtitleSettingsSave).toHaveBeenCalledWith(
      expect.objectContaining({ secondaryEnabled: true })
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

  it('keeps the settings page scroll inside the main content pane', () => {
    const styles = readFileSync('src/renderer/styles.css', 'utf8');
    const rootRule = styles.match(/html,\s*[\r\n]+body,\s*[\r\n]+#root\s*\{(?<body>[^}]*)\}/);
    const desktopShellRule = styles.match(/\.desktop-shell\s*\{(?<body>[^}]*)\}/);
    const appMainRule = styles.match(/\.app-main\s*\{(?<body>[^}]*)\}/);
    const wideRowRule = styles.match(/\.settings-row--wide\s*\{(?<body>[^}]*)\}/);
    const wideFormRowRule = styles.match(
      /\.settings-row--form\.settings-row--wide\s*\{(?<body>[^}]*)\}/
    );
    const wideControlRule = styles.match(/\.settings-row__control--wide\s*\{(?<body>[^}]*)\}/);
    const iconRule = styles.match(/\.settings-row__icon\s*\{(?<body>[^}]*)\}/);
    const iconSvgRule = styles.match(/\.settings-row__icon svg\s*\{(?<body>[^}]*)\}/);
    const stackedIconRule = styles.match(
      /\.settings-row--stacked \.settings-row__icon\s*\{(?<body>[^}]*)\}/
    );

    expect(rootRule?.groups?.body).toContain('height: 100%');
    expect(rootRule?.groups?.body).toContain('overflow: hidden');
    expect(desktopShellRule?.groups?.body).toContain('width: 100%');
    expect(desktopShellRule?.groups?.body).not.toContain('width: 100vw');
    expect(appMainRule?.groups?.body).toContain('overflow-y: auto');
    expect(appMainRule?.groups?.body).toContain('overflow-x: hidden');
    expect(appMainRule?.groups?.body).toContain('min-height: 0');
    expect(wideRowRule?.groups?.body).toContain(
      'grid-template-columns: 34px minmax(0, 1fr) minmax(180px, auto)'
    );
    expect(wideFormRowRule?.groups?.body).toContain(
      'grid-template-columns: 34px minmax(160px, 260px) minmax(320px, 1fr)'
    );
    expect(wideControlRule?.groups?.body).toContain('justify-content: flex-end');
    expect(iconRule?.groups?.body).toContain('width: 34px');
    expect(iconRule?.groups?.body).toContain('height: 34px');
    expect(iconRule?.groups?.body).not.toContain('font-size');
    expect(iconSvgRule?.groups?.body).toContain('width: 18px');
    expect(iconSvgRule?.groups?.body).toContain('height: 18px');
    expect(stackedIconRule?.groups?.body).toContain('margin-top: 3px');
  });
});
