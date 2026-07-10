import { useEffect, useState, type FormEvent } from 'react';
import type {
  CacheSettings,
  DataCacheTtlDays,
  DanmakuConversionMode,
  DanmakuMatchMode,
  DanmakuSettings,
  DanmakuServerSettings,
  ImageCacheMaxBytes,
  ImageCacheResolution,
  PlaybackScaleMode,
  PlaybackSettings,
  ProxyMode,
  ProxySettings,
  SubtitleSettings,
  ThemeMode,
} from '@shared/models/settings';
import { Layout } from '@renderer/components/Layout';
import { SettingsIcon } from './settingsIcons';

interface SettingsPageProps {
  userName?: string;
  serverUrl: string;
  defaultVolume: number;
  proxyMode: ProxyMode;
  customProxyUrl: string;
  playbackSettings: PlaybackSettings;
  subtitleSettings: SubtitleSettings;
  danmakuServers: DanmakuServerSettings[];
  danmakuSettings: DanmakuSettings;
  cacheSettings: CacheSettings;
  themeMode: ThemeMode;
  dataCacheBytes: number;
  imageCacheBytes: number;
  onCacheSettingsSave: (next: CacheSettings) => void | Promise<void>;
  onClearDataCache: () => void | Promise<void>;
  onClearImageCache: () => void | Promise<void>;
  onDanmakuServersSave: (next: DanmakuServerSettings[]) => void | Promise<void>;
  onDanmakuSettingsSave: (next: DanmakuSettings) => void | Promise<void>;
  onPlaybackSettingsSave: (next: PlaybackSettings) => void | Promise<void>;
  onProxySettingsSave: (next: ProxySettings) => void | Promise<void>;
  onSubtitleSettingsSave: (next: SubtitleSettings) => void | Promise<void>;
  onThemeModeSave: (next: ThemeMode) => void | Promise<void>;
  onLogout: () => void;
}

const DATA_CACHE_TTL_OPTIONS: Array<{ label: string; value: string; days: DataCacheTtlDays }> = [
  { label: '1天', value: '1', days: 1 },
  { label: '7天', value: '7', days: 7 },
  { label: '30天', value: '30', days: 30 },
  { label: '永不过期', value: 'never', days: null },
];

const IMAGE_CACHE_LIMIT_OPTIONS: Array<{ label: string; value: ImageCacheMaxBytes }> = [
  { label: '100 MB', value: 104857600 },
  { label: '300 MB', value: 314572800 },
  { label: '500 MB', value: 524288000 },
  { label: '1 GB', value: 1073741824 },
];

const IMAGE_CACHE_RESOLUTION_OPTIONS: Array<{ label: string; value: ImageCacheResolution }> = [
  { label: '原图', value: 'original' },
  { label: '1080p', value: 1080 },
  { label: '720p', value: 720 },
  { label: '480p', value: 480 },
];

const THEME_MODE_OPTIONS: Array<{
  label: string;
  description: string;
  value: ThemeMode;
}> = [
  { label: '暗黑模式', description: '低亮度界面，适合夜间或暗光观影环境', value: 'dark' },
  { label: '日常模式', description: '清爽平衡的默认观感，适合白天和普通桌面使用', value: 'daily' },
  { label: '护眼模式', description: '暖色、低刺激界面，适合长时间浏览媒体库', value: 'eye' },
];

const THEME_MODE_ARIA_LABELS: Record<ThemeMode, string> = {
  dark: 'Dark Mode',
  daily: 'Daily Mode',
  eye: 'Eye Protection Mode',
};

function formatCacheBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Number((bytes / 1024).toFixed(1)).toLocaleString('en-US')} KB`;
  }

  return `${Number((bytes / 1024 / 1024).toFixed(1)).toLocaleString('en-US')} MB`;
}

function parseDataCacheTtlDays(value: string): DataCacheTtlDays {
  if (value === 'never') {
    return null;
  }

  return Number(value) as DataCacheTtlDays;
}

function createDanmakuServerDraft(index: number): DanmakuServerSettings {
  return {
    id: `danmaku-${Date.now()}-${index}`,
    name: '',
    url: '',
    appId: '',
    appSecret: '',
    enabled: true,
  };
}

function normalizeDanmakuServerDraft(
  server: DanmakuServerSettings,
  index: number
): DanmakuServerSettings {
  return {
    id: server.id || `danmaku-${Date.now()}-${index}`,
    name: server.name.trim(),
    url: server.url.trim(),
    appId: server.appId?.trim() ?? '',
    appSecret: server.appSecret?.trim() ?? '',
    enabled: server.enabled,
  };
}

export function SettingsPage({
  userName = 'Unknown user',
  serverUrl,
  defaultVolume,
  proxyMode,
  customProxyUrl,
  playbackSettings,
  subtitleSettings,
  danmakuServers,
  danmakuSettings,
  cacheSettings,
  themeMode,
  dataCacheBytes,
  imageCacheBytes,
  onCacheSettingsSave,
  onClearDataCache,
  onClearImageCache,
  onDanmakuServersSave,
  onDanmakuSettingsSave,
  onPlaybackSettingsSave,
  onProxySettingsSave,
  onSubtitleSettingsSave,
  onThemeModeSave,
  onLogout,
}: SettingsPageProps) {
  const [draftProxyMode, setDraftProxyMode] = useState(proxyMode);
  const [draftCustomProxyUrl, setDraftCustomProxyUrl] = useState(customProxyUrl);
  const [draftDanmakuServers, setDraftDanmakuServers] = useState(danmakuServers);
  const [isDanmakuServersOpen, setIsDanmakuServersOpen] = useState(false);
  const [isDanmakuBlocklistOpen, setIsDanmakuBlocklistOpen] = useState(false);
  const [proxySaveError, setProxySaveError] = useState('');
  const [danmakuSaveError, setDanmakuSaveError] = useState('');
  const selectedDataCacheTtlValue =
    DATA_CACHE_TTL_OPTIONS.find((option) => option.days === cacheSettings.dataCacheTtlDays)?.value ??
    '30';

  function saveCacheSettingsPatch(nextPatch: Partial<CacheSettings>) {
    void onCacheSettingsSave({
      ...cacheSettings,
      ...nextPatch,
    });
  }

  function saveDanmakuSettingsPatch(nextPatch: Partial<DanmakuSettings>) {
    void onDanmakuSettingsSave({
      ...danmakuSettings,
      ...nextPatch,
    });
  }

  function savePlaybackSettingsPatch(nextPatch: Partial<PlaybackSettings>) {
    void onPlaybackSettingsSave({
      ...playbackSettings,
      ...nextPatch,
    });
  }

  function saveSubtitleSettingsPatch(nextPatch: Partial<SubtitleSettings>) {
    void onSubtitleSettingsSave({
      ...subtitleSettings,
      ...nextPatch,
    });
  }

  useEffect(() => {
    setDraftProxyMode(proxyMode);
    setDraftCustomProxyUrl(customProxyUrl);
    setProxySaveError('');
  }, [customProxyUrl, proxyMode]);

  useEffect(() => {
    setDraftDanmakuServers(danmakuServers);
    setDanmakuSaveError('');
  }, [danmakuServers]);

  async function handleProxySettingsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await onProxySettingsSave({
        mode: draftProxyMode,
        customProxyUrl: draftCustomProxyUrl.trim(),
      });
      setProxySaveError('');
    } catch {
      setProxySaveError('Could not save proxy settings. Check the proxy URL and try again.');
    }
  }

  async function handleDanmakuServersSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextServers = draftDanmakuServers
      .map(normalizeDanmakuServerDraft)
      .filter((server) => server.url.length > 0);

    try {
      await onDanmakuServersSave(nextServers);
      setDanmakuSaveError('');
    } catch {
      setDanmakuSaveError('Could not save danmaku servers. Check the server URLs and try again.');
    }
  }

  function updateDanmakuServer(
    id: string,
    updater: (server: DanmakuServerSettings) => DanmakuServerSettings
  ) {
    setDraftDanmakuServers((current) =>
      current.map((server) => (server.id === id ? updater(server) : server))
    );
    setDanmakuSaveError('');
  }

  const primaryDanmakuServer =
    danmakuServers.find((server) => server.enabled && server.url.trim()) ??
    danmakuServers.find((server) => server.url.trim());
  const danmakuServerSummary = primaryDanmakuServer?.url.trim() || '未配置';
  const blocklistValue = danmakuSettings.blocklist.join('\n');

  return (
    <Layout title="Settings">
      <section className="settings-page" aria-labelledby="settings-title">
        <header className="settings-page__header">
          <h1 id="settings-title">设置</h1>
        </header>

        <section className="settings-group" aria-labelledby="settings-general-title">
          <h2 id="settings-general-title">通用</h2>

          <div className="settings-list">
            <div className="settings-row">
              <SettingsIcon id="currentAccount" />
              <div className="settings-row__body">
                <h3>当前账户</h3>
                <p>正在使用的 Emby 用户</p>
              </div>
              <strong className="settings-row__value">{userName}</strong>
            </div>

            <div className="settings-row">
              <SettingsIcon id="serverUrl" />
              <div className="settings-row__body">
                <h3>服务器地址</h3>
                <p>当前连接的媒体服务器</p>
              </div>
              <span className="settings-row__value settings-row__value--url">{serverUrl}</span>
            </div>

            <div className="settings-row">
              <SettingsIcon id="defaultVolume" />
              <div className="settings-row__body">
                <h3>默认音量</h3>
                <p>播放器启动时使用的音量</p>
              </div>
              <strong className="settings-row__value">{Math.round(defaultVolume * 100)}%</strong>
            </div>

            <div className="settings-row settings-row--theme">
              <SettingsIcon id="themeMode" />
              <div className="settings-row__body">
                <h3>客户端色调</h3>
                <p>改变整个客户端的色调</p>
              </div>
              <div
                aria-label="Client theme"
                className="settings-theme-options"
                role="radiogroup"
              >
                {THEME_MODE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    aria-checked={themeMode === option.value}
                    aria-label={THEME_MODE_ARIA_LABELS[option.value]}
                    className="settings-theme-option"
                    data-theme-option={option.value}
                    role="radio"
                    type="button"
                    onClick={() => void onThemeModeSave(option.value)}
                  >
                    <span className="settings-theme-option__swatch" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="settings-theme-option__text">
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="settings-group" aria-labelledby="settings-playback-title">
          <h2 id="settings-playback-title">播放器</h2>

          <div className="settings-list">
            <div className="settings-row">
              <SettingsIcon id="playbackScale" />
              <div className="settings-row__body">
                <h3>缩放模式</h3>
              </div>
              <select
                className="settings-select"
                aria-label="Playback scale mode"
                value={playbackSettings.scaleMode}
                onChange={(event) =>
                  savePlaybackSettingsPatch({
                    scaleMode: event.target.value as PlaybackScaleMode,
                  })
                }
              >
                <option value="fit">适应屏幕</option>
                <option value="stretch">拉伸</option>
                <option value="crop">裁剪</option>
              </select>
            </div>

            <div className="settings-row">
              <SettingsIcon id="subtitleEnabled" />
              <div className="settings-row__body">
                <h3>字幕显示</h3>
              </div>
              <label className="settings-switch">
                <input
                  aria-label="Enable subtitles"
                  type="checkbox"
                  checked={subtitleSettings.enabled}
                  onChange={(event) =>
                    saveSubtitleSettingsPatch({ enabled: event.target.checked })
                  }
                />
                <span />
              </label>
            </div>

            <div className="settings-row">
              <SettingsIcon id="subtitleFont" />
              <div className="settings-row__body">
                <h3>字幕字体</h3>
              </div>
              <div className="settings-row__control">
                <input
                  aria-label="Subtitle font family"
                  type="text"
                  value={subtitleSettings.fontFamily}
                  onChange={(event) =>
                    saveSubtitleSettingsPatch({ fontFamily: event.target.value })
                  }
                />
              </div>
            </div>

            <div className="settings-row">
              <SettingsIcon id="subtitleDelay" />
              <div className="settings-row__body">
                <h3>字幕同步</h3>
              </div>
              <div className="settings-row__control">
                <input
                  aria-label="Subtitle delay"
                  type="number"
                  min="-30"
                  max="30"
                  step="0.1"
                  value={subtitleSettings.delaySeconds}
                  onChange={(event) =>
                    saveSubtitleSettingsPatch({ delaySeconds: Number(event.target.value) })
                  }
                />
              </div>
            </div>

            <div className="settings-row">
              <SettingsIcon id="subtitleSize" />
              <div className="settings-row__body">
                <h3>字幕大小</h3>
              </div>
              <label className="settings-range">
                <input
                  aria-label="Subtitle font size"
                  type="range"
                  min="12"
                  max="120"
                  value={subtitleSettings.fontSize}
                  onChange={(event) =>
                    saveSubtitleSettingsPatch({ fontSize: Number(event.target.value) })
                  }
                />
                <strong>{subtitleSettings.fontSize}</strong>
              </label>
            </div>

            <div className="settings-row">
              <SettingsIcon id="subtitlePosition" />
              <div className="settings-row__body">
                <h3>字幕位置</h3>
              </div>
              <label className="settings-range">
                <input
                  aria-label="Subtitle position"
                  type="range"
                  min="0"
                  max="150"
                  value={subtitleSettings.position}
                  onChange={(event) =>
                    saveSubtitleSettingsPatch({ position: Number(event.target.value) })
                  }
                />
                <strong>{subtitleSettings.position}</strong>
              </label>
            </div>

            <div className="settings-row">
              <SettingsIcon id="subtitleOutline" />
              <div className="settings-row__body">
                <h3>字幕描边</h3>
              </div>
              <label className="settings-range">
                <input
                  aria-label="Subtitle outline"
                  type="range"
                  min="0"
                  max="12"
                  value={subtitleSettings.outline}
                  onChange={(event) =>
                    saveSubtitleSettingsPatch({ outline: Number(event.target.value) })
                  }
                />
                <strong>{subtitleSettings.outline}</strong>
              </label>
            </div>

            <div className="settings-row">
              <SettingsIcon id="subtitleShadow" />
              <div className="settings-row__body">
                <h3>字幕阴影</h3>
              </div>
              <label className="settings-range">
                <input
                  aria-label="Subtitle shadow offset"
                  type="range"
                  min="0"
                  max="12"
                  value={subtitleSettings.shadowOffset}
                  onChange={(event) =>
                    saveSubtitleSettingsPatch({ shadowOffset: Number(event.target.value) })
                  }
                />
                <strong>{subtitleSettings.shadowOffset}</strong>
              </label>
            </div>

            <div className="settings-row">
              <SettingsIcon id="subtitleScale" />
              <div className="settings-row__body">
                <h3>字幕缩放</h3>
              </div>
              <label className="settings-range">
                <input
                  aria-label="Subtitle scale"
                  type="range"
                  min="50"
                  max="200"
                  step="10"
                  value={Math.round(subtitleSettings.scale * 100)}
                  onChange={(event) =>
                    saveSubtitleSettingsPatch({ scale: Number(event.target.value) / 100 })
                  }
                />
                <strong>{subtitleSettings.scale.toFixed(1)}x</strong>
              </label>
            </div>

            <div className="settings-row">
              <SettingsIcon id="subtitleSecondary" />
              <div className="settings-row__body">
                <h3>双字幕</h3>
              </div>
              <label className="settings-switch">
                <input
                  aria-label="Enable secondary subtitles"
                  type="checkbox"
                  checked={subtitleSettings.secondaryEnabled}
                  onChange={(event) =>
                    saveSubtitleSettingsPatch({ secondaryEnabled: event.target.checked })
                  }
                />
                <span />
              </label>
            </div>
          </div>
        </section>

        <section className="settings-group" aria-labelledby="settings-media-title">
          <h2 id="settings-media-title">媒体库</h2>

          <div className="settings-list">
            <div className="settings-row">
              <SettingsIcon id="dataCache" />
              <div className="settings-row__body">
                <h3>数据缓存</h3>
                <p>开启后进入主页时会先显示本地保存的媒体库数据</p>
              </div>
              <label className="settings-switch">
                <input
                  aria-label="Data cache"
                  type="checkbox"
                  checked={cacheSettings.dataCacheEnabled}
                  onChange={(event) =>
                    saveCacheSettingsPatch({ dataCacheEnabled: event.target.checked })
                  }
                />
                <span />
              </label>
            </div>

            <div className="settings-row">
              <SettingsIcon id="dataCacheExpiration" />
              <div className="settings-row__body">
                <h3>数据缓存过期时间</h3>
                <p>过期后仍会先显示旧缓存，并在后台刷新为最新内容</p>
              </div>
              <select
                className="settings-select"
                aria-label="Data cache expiration"
                value={selectedDataCacheTtlValue}
                onChange={(event) =>
                  saveCacheSettingsPatch({
                    dataCacheTtlDays: parseDataCacheTtlDays(event.target.value),
                  })
                }
              >
                {DATA_CACHE_TTL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="settings-row">
              <SettingsIcon id="imageCache" />
              <div className="settings-row__body">
                <h3>图片缓存</h3>
                <p>开启后海报会保存到本地，下次显示时优先读取本地文件</p>
              </div>
              <label className="settings-switch">
                <input
                  aria-label="Image cache"
                  type="checkbox"
                  checked={cacheSettings.imageCacheEnabled}
                  onChange={(event) =>
                    saveCacheSettingsPatch({ imageCacheEnabled: event.target.checked })
                  }
                />
                <span />
              </label>
            </div>

            <div className="settings-row">
              <SettingsIcon id="imageCacheLimit" />
              <div className="settings-row__body">
                <h3>图片缓存上限</h3>
                <p>超过上限后会自动清理最久未使用的海报</p>
              </div>
              <select
                className="settings-select"
                aria-label="Image cache limit"
                value={cacheSettings.imageCacheMaxBytes}
                onChange={(event) =>
                  saveCacheSettingsPatch({
                    imageCacheMaxBytes: Number(event.target.value) as ImageCacheMaxBytes,
                  })
                }
              >
                {IMAGE_CACHE_LIMIT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="settings-row">
              <SettingsIcon id="imageCacheResolution" />
              <div className="settings-row__body">
                <h3>图片缓存分辨率</h3>
                <p>降低缓存海报的最长边分辨率，减少本地磁盘占用</p>
              </div>
              <select
                className="settings-select"
                aria-label="Image cache resolution"
                value={cacheSettings.imageCacheResolution}
                onChange={(event) =>
                  saveCacheSettingsPatch({
                    imageCacheResolution:
                      event.target.value === 'original'
                        ? 'original'
                        : (Number(event.target.value) as ImageCacheResolution),
                  })
                }
              >
                {IMAGE_CACHE_RESOLUTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="settings-row">
              <SettingsIcon id="clearDataCache" />
              <div className="settings-row__body">
                <h3>数据缓存</h3>
                <p>{formatCacheBytes(dataCacheBytes)}</p>
              </div>
              <button
                className="settings-secondary-button"
                type="button"
                aria-label="Clear data cache"
                onClick={() => void onClearDataCache()}
              >
                清空缓存
              </button>
            </div>

            <div className="settings-row">
              <SettingsIcon id="clearImageCache" />
              <div className="settings-row__body">
                <h3>图片缓存</h3>
                <p>{formatCacheBytes(imageCacheBytes)}</p>
              </div>
              <button
                className="settings-secondary-button"
                type="button"
                aria-label="Clear image cache"
                onClick={() => void onClearImageCache()}
              >
                清空缓存
              </button>
            </div>
          </div>
        </section>

        <section className="settings-group" aria-labelledby="settings-danmaku-title">
          <h2 id="settings-danmaku-title">弹幕</h2>

          <div className="settings-list">
            <div className="settings-row">
              <SettingsIcon id="danmakuEnabled" />
              <div className="settings-row__body">
                <h3>开启弹幕</h3>
                <p>数据来源于 DandanPlay API，只支持动漫资源</p>
              </div>
              <label className="settings-switch">
                <input
                  aria-label="Enable danmaku"
                  type="checkbox"
                  checked={danmakuSettings.enabled}
                  onChange={(event) =>
                    saveDanmakuSettingsPatch({ enabled: event.target.checked })
                  }
                />
                <span />
              </label>
            </div>

            <div className="settings-row">
              <SettingsIcon id="danmakuScrollLines" />
              <div className="settings-row__body">
                <h3>滚动弹幕最大行数</h3>
              </div>
              <label className="settings-range">
                <input
                  aria-label="Scrolling danmaku max lines"
                  type="range"
                  min="1"
                  max="12"
                  value={danmakuSettings.scrollMaxLines}
                  onChange={(event) =>
                    saveDanmakuSettingsPatch({ scrollMaxLines: Number(event.target.value) })
                  }
                />
                <strong>{danmakuSettings.scrollMaxLines}</strong>
              </label>
            </div>

            <div className="settings-row">
              <SettingsIcon id="danmakuTopLines" />
              <div className="settings-row__body">
                <h3>顶部弹幕最大行数</h3>
              </div>
              <label className="settings-range">
                <input
                  aria-label="Top danmaku max lines"
                  type="range"
                  min="1"
                  max="12"
                  value={danmakuSettings.topMaxLines}
                  onChange={(event) =>
                    saveDanmakuSettingsPatch({ topMaxLines: Number(event.target.value) })
                  }
                />
                <strong>{danmakuSettings.topMaxLines}</strong>
              </label>
            </div>

            <div className="settings-row">
              <SettingsIcon id="danmakuBottomLines" />
              <div className="settings-row__body">
                <h3>底部弹幕最大行数</h3>
              </div>
              <label className="settings-range">
                <input
                  aria-label="Bottom danmaku max lines"
                  type="range"
                  min="1"
                  max="12"
                  value={danmakuSettings.bottomMaxLines}
                  onChange={(event) =>
                    saveDanmakuSettingsPatch({ bottomMaxLines: Number(event.target.value) })
                  }
                />
                <strong>{danmakuSettings.bottomMaxLines}</strong>
              </label>
            </div>

            <div className="settings-row">
              <SettingsIcon id="danmakuScale" />
              <div className="settings-row__body">
                <h3>弹幕缩放</h3>
              </div>
              <label className="settings-range">
                <input
                  aria-label="Danmaku scale"
                  type="range"
                  min="50"
                  max="200"
                  step="10"
                  value={Math.round(danmakuSettings.scale * 100)}
                  onChange={(event) =>
                    saveDanmakuSettingsPatch({ scale: Number(event.target.value) / 100 })
                  }
                />
                <strong>{danmakuSettings.scale.toFixed(1)}x</strong>
              </label>
            </div>

            <div className="settings-row">
              <SettingsIcon id="danmakuOpacity" />
              <div className="settings-row__body">
                <h3>弹幕透明度</h3>
              </div>
              <label className="settings-range">
                <input
                  aria-label="Danmaku opacity"
                  type="range"
                  min="0"
                  max="100"
                  value={Math.round(danmakuSettings.opacity * 100)}
                  onChange={(event) =>
                    saveDanmakuSettingsPatch({ opacity: Number(event.target.value) / 100 })
                  }
                />
                <strong>{Math.round(danmakuSettings.opacity * 100)}%</strong>
              </label>
            </div>

            <div className="settings-row">
              <SettingsIcon id="danmakuSpeed" />
              <div className="settings-row__body">
                <h3>弹幕滚动速度</h3>
              </div>
              <label className="settings-range">
                <input
                  aria-label="Danmaku scroll speed"
                  type="range"
                  min="50"
                  max="200"
                  step="10"
                  value={Math.round(danmakuSettings.speed * 100)}
                  onChange={(event) =>
                    saveDanmakuSettingsPatch({ speed: Number(event.target.value) / 100 })
                  }
                />
                <strong>{danmakuSettings.speed.toFixed(1)}x</strong>
              </label>
            </div>

            <div className="settings-row">
              <SettingsIcon id="danmakuBold" />
              <div className="settings-row__body">
                <h3>粗体</h3>
              </div>
              <label className="settings-switch">
                <input
                  aria-label="Bold danmaku"
                  type="checkbox"
                  checked={danmakuSettings.bold}
                  onChange={(event) => saveDanmakuSettingsPatch({ bold: event.target.checked })}
                />
                <span />
              </label>
            </div>

            <div className="settings-row settings-row--stacked settings-row--wide">
              <SettingsIcon id="danmakuBlocklist" />
              <div className="settings-row__body">
                <h3>弹幕屏蔽词</h3>
                <p>添加屏蔽词，若有多个时使用换行进行分隔，正则以 / 开头以 / 结尾</p>
              </div>
              <div className="settings-row__control settings-row__control--wide">
                <button
                  type="button"
                  aria-expanded={isDanmakuBlocklistOpen}
                  aria-label="Edit danmaku blocklist"
                  onClick={() => setIsDanmakuBlocklistOpen((current) => !current)}
                >
                  {danmakuSettings.blocklist.length > 0
                    ? `${danmakuSettings.blocklist.length} 项`
                    : '设置'}
                </button>
                {isDanmakuBlocklistOpen ? (
                  <textarea
                    aria-label="Danmaku blocklist"
                    className="settings-textarea"
                    value={blocklistValue}
                    onChange={(event) =>
                      saveDanmakuSettingsPatch({
                        blocklist: event.target.value
                          .split(/\r?\n/u)
                          .map((entry) => entry.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                ) : null}
              </div>
            </div>

            <div className="settings-row">
              <SettingsIcon id="danmakuMatchMode" />
              <div className="settings-row__body">
                <h3>弹幕匹配模式</h3>
                <p>修改弹幕匹配模式，哈希值通过计算视频文件前16MB数据MD5得到</p>
              </div>
              <select
                aria-label="Danmaku match mode"
                className="settings-select"
                value={danmakuSettings.matchMode}
                onChange={(event) =>
                  saveDanmakuSettingsPatch({
                    matchMode: event.target.value as DanmakuMatchMode,
                  })
                }
              >
                <option value="fileName">仅文件名</option>
                <option value="hashAndFileName">哈希值与文件名</option>
              </select>
            </div>

            <div className="settings-row">
              <SettingsIcon id="danmakuConversion" />
              <div className="settings-row__body">
                <h3>弹幕简繁体转换</h3>
                <p>修改弹幕简繁体转换，需弹幕 API 支持</p>
              </div>
              <select
                aria-label="Danmaku conversion mode"
                className="settings-select"
                value={danmakuSettings.conversionMode}
                onChange={(event) =>
                  saveDanmakuSettingsPatch({
                    conversionMode: event.target.value as DanmakuConversionMode,
                  })
                }
              >
                <option value="off">关闭</option>
                <option value="simplified">转简体</option>
                <option value="traditional">转繁体</option>
              </select>
            </div>

            <div className="settings-row">
              <SettingsIcon id="danmakuApi" />
              <div className="settings-row__body">
                <h3>弹幕 API 基础地址</h3>
                <p>管理弹幕 API URL，按列表顺序作为匹配优先级</p>
              </div>
              <button
                type="button"
                aria-expanded={isDanmakuServersOpen}
                aria-label="Edit danmaku API servers"
                onClick={() => setIsDanmakuServersOpen((current) => !current)}
              >
                {danmakuServerSummary}
              </button>
            </div>

            {isDanmakuServersOpen ? (
            <form
              className="settings-row settings-row--form settings-row--stacked settings-row--wide"
              onSubmit={(event) => void handleDanmakuServersSubmit(event)}
            >
              <SettingsIcon id="danmakuServerForm" />
              <div className="settings-row__body">
                <h3>弹幕服务器</h3>
                <p>兼容弹弹play API，可配置多个并按顺序尝试</p>
              </div>
              <div className="settings-row__control settings-row__control--wide">
                <div className="settings-danmaku-list">
                  {draftDanmakuServers.map((server, index) => (
                    <fieldset className="settings-danmaku-server" key={server.id}>
                      <legend>服务器 {index + 1}</legend>
                      <label>
                        <span>名称</span>
                        <input
                          aria-label={`Danmaku server name ${index + 1}`}
                          type="text"
                          value={server.name}
                          onChange={(event) =>
                            updateDanmakuServer(server.id, (current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        <span>地址</span>
                        <input
                          aria-label={`Danmaku server URL ${index + 1}`}
                          placeholder="https://api.dandanplay.net"
                          type="url"
                          value={server.url}
                          onChange={(event) =>
                            updateDanmakuServer(server.id, (current) => ({
                              ...current,
                              url: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        <span>AppId</span>
                        <input
                          aria-label={`Danmaku AppId ${index + 1}`}
                          type="text"
                          value={server.appId ?? ''}
                          onChange={(event) =>
                            updateDanmakuServer(server.id, (current) => ({
                              ...current,
                              appId: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        <span>AppSecret</span>
                        <input
                          aria-label={`Danmaku AppSecret ${index + 1}`}
                          type="password"
                          value={server.appSecret ?? ''}
                          onChange={(event) =>
                            updateDanmakuServer(server.id, (current) => ({
                              ...current,
                              appSecret: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="settings-danmaku-server__enabled">
                        <input
                          aria-label={`Enable danmaku server ${index + 1}`}
                          checked={server.enabled}
                          type="checkbox"
                          onChange={(event) =>
                            updateDanmakuServer(server.id, (current) => ({
                              ...current,
                              enabled: event.target.checked,
                            }))
                          }
                        />
                        <span>启用</span>
                      </label>
                      <button
                        aria-label={`Remove danmaku server ${index + 1}`}
                        type="button"
                        onClick={() =>
                          setDraftDanmakuServers((current) =>
                            current.filter((candidate) => candidate.id !== server.id)
                          )
                        }
                      >
                        删除
                      </button>
                    </fieldset>
                  ))}
                </div>
                <button
                  type="button"
                  aria-label="Add danmaku server"
                  onClick={() =>
                    setDraftDanmakuServers((current) => [
                      ...current,
                      createDanmakuServerDraft(current.length + 1),
                    ])
                  }
                >
                  添加弹幕服务器
                </button>
                <button type="submit" aria-label="Save danmaku servers">
                  保存弹幕服务器
                </button>
                {danmakuSaveError ? <p role="alert">{danmakuSaveError}</p> : null}
              </div>
            </form>
            ) : null}
          </div>
        </section>

        <section className="settings-group" aria-labelledby="settings-network-title">
          <h2 id="settings-network-title">网络与账户</h2>

          <div className="settings-list">
            <form
              className="settings-row settings-row--form settings-row--stacked"
              noValidate
              onSubmit={(event) => void handleProxySettingsSubmit(event)}
            >
              <SettingsIcon id="proxy" />
              <div className="settings-row__body">
                <h3>代理</h3>
                <p>配置媒体请求使用的网络代理</p>
              </div>
              <div className="settings-row__control">
                <fieldset className="settings-segmented">
                  <legend className="sr-only">Proxy</legend>

                  <label>
                    <input
                      aria-label="Use Windows system proxy"
                      name="proxy-mode"
                      type="radio"
                      checked={draftProxyMode === 'system'}
                      onChange={() => {
                        setDraftProxyMode('system');
                        setProxySaveError('');
                      }}
                    />
                    <span>系统代理</span>
                  </label>

                  <label>
                    <input
                      aria-label="Direct connection"
                      name="proxy-mode"
                      type="radio"
                      checked={draftProxyMode === 'direct'}
                      onChange={() => {
                        setDraftProxyMode('direct');
                        setProxySaveError('');
                      }}
                    />
                    <span>直连</span>
                  </label>

                  <label>
                    <input
                      aria-label="Custom proxy"
                      name="proxy-mode"
                      type="radio"
                      checked={draftProxyMode === 'custom'}
                      onChange={() => {
                        setDraftProxyMode('custom');
                        setProxySaveError('');
                      }}
                    />
                    <span>自定义</span>
                  </label>
                </fieldset>

                {draftProxyMode === 'custom' ? (
                  <div className="settings-proxy-url">
                    <label className="sr-only" htmlFor="custom-proxy-url">
                      Custom proxy URL
                    </label>
                    <input
                      id="custom-proxy-url"
                      name="custom-proxy-url"
                      type="url"
                      placeholder="http://127.0.0.1:7890"
                      value={draftCustomProxyUrl}
                      onChange={(event) => {
                        setDraftCustomProxyUrl(event.target.value);
                        setProxySaveError('');
                      }}
                    />
                  </div>
                ) : null}

                <button type="submit" aria-label="Save proxy settings">
                  保存代理设置
                </button>
                {proxySaveError ? <p role="alert">{proxySaveError}</p> : null}
              </div>
            </form>

            <div className="settings-row">
              <SettingsIcon id="logout" />
              <div className="settings-row__body">
                <h3>退出登录</h3>
                <p>从当前服务器账户退出</p>
              </div>
              <button
                className="settings-danger-button"
                type="button"
                onClick={onLogout}
                aria-label="Sign out"
              >
                退出
              </button>
            </div>
          </div>
        </section>
      </section>
    </Layout>
  );
}
