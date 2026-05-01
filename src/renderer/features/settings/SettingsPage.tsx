import { useEffect, useState, type FormEvent } from 'react';
import type {
  DanmakuServerSettings,
  ProxyMode,
  ProxySettings,
} from '@shared/models/settings';
import { Layout } from '@renderer/components/Layout';

interface SettingsPageProps {
  userName?: string;
  serverUrl: string;
  defaultVolume: number;
  proxyMode: ProxyMode;
  customProxyUrl: string;
  danmakuServers: DanmakuServerSettings[];
  onDanmakuServersSave: (next: DanmakuServerSettings[]) => void | Promise<void>;
  onProxySettingsSave: (next: ProxySettings) => void | Promise<void>;
  onLogout: () => void;
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
  danmakuServers,
  onDanmakuServersSave,
  onProxySettingsSave,
  onLogout,
}: SettingsPageProps) {
  const [draftProxyMode, setDraftProxyMode] = useState(proxyMode);
  const [draftCustomProxyUrl, setDraftCustomProxyUrl] = useState(customProxyUrl);
  const [draftDanmakuServers, setDraftDanmakuServers] = useState(danmakuServers);
  const [proxySaveError, setProxySaveError] = useState('');
  const [danmakuSaveError, setDanmakuSaveError] = useState('');

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
              <span className="settings-row__icon" aria-hidden="true">
                👤
              </span>
              <div className="settings-row__body">
                <h3>当前账户</h3>
                <p>正在使用的 Emby 用户</p>
              </div>
              <strong className="settings-row__value">{userName}</strong>
            </div>

            <div className="settings-row">
              <span className="settings-row__icon" aria-hidden="true">
                🔗
              </span>
              <div className="settings-row__body">
                <h3>服务器地址</h3>
                <p>当前连接的媒体服务器</p>
              </div>
              <span className="settings-row__value settings-row__value--url">{serverUrl}</span>
            </div>

            <div className="settings-row">
              <span className="settings-row__icon" aria-hidden="true">
                🔊
              </span>
              <div className="settings-row__body">
                <h3>默认音量</h3>
                <p>播放器启动时使用的音量</p>
              </div>
              <strong className="settings-row__value">{Math.round(defaultVolume * 100)}%</strong>
            </div>
          </div>
        </section>

        <section className="settings-group" aria-labelledby="settings-danmaku-title">
          <h2 id="settings-danmaku-title">弹幕</h2>

          <div className="settings-list">
            <form
              className="settings-row settings-row--form settings-row--stacked settings-row--wide"
              onSubmit={(event) => void handleDanmakuServersSubmit(event)}
            >
              <span className="settings-row__icon" aria-hidden="true">
                DM
              </span>
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
              <span className="settings-row__icon" aria-hidden="true">
                🛡
              </span>
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
              <span className="settings-row__icon" aria-hidden="true">
                ⎋
              </span>
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
