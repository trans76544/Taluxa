import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ProxyMode, ProxySettings } from '@shared/models/settings';
import { Layout } from '@renderer/components/Layout';

interface SettingsPageProps {
  userName?: string;
  serverUrl: string;
  serverDisplayName: string;
  defaultVolume: number;
  proxyMode: ProxyMode;
  customProxyUrl: string;
  onProxySettingsSave: (next: ProxySettings) => void | Promise<void>;
  onServerDisplayNameSave: (nextName: string) => void | Promise<void>;
  onLogout: () => void;
}

export function SettingsPage({
  userName = 'Unknown user',
  serverUrl,
  serverDisplayName,
  defaultVolume,
  proxyMode,
  customProxyUrl,
  onProxySettingsSave,
  onServerDisplayNameSave,
  onLogout,
}: SettingsPageProps) {
  const [draftServerDisplayName, setDraftServerDisplayName] = useState(serverDisplayName);
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  const [draftProxyMode, setDraftProxyMode] = useState(proxyMode);
  const [draftCustomProxyUrl, setDraftCustomProxyUrl] = useState(customProxyUrl);
  const [serverSaveError, setServerSaveError] = useState('');
  const [proxySaveError, setProxySaveError] = useState('');
  const lastServerUrlRef = useRef(serverUrl);

  useEffect(() => {
    const serverChanged = lastServerUrlRef.current !== serverUrl;
    lastServerUrlRef.current = serverUrl;

    if (serverChanged || !isDraftDirty || draftServerDisplayName === serverDisplayName) {
      setDraftServerDisplayName(serverDisplayName);
      setIsDraftDirty(false);
      setServerSaveError('');
    }
  }, [draftServerDisplayName, isDraftDirty, serverDisplayName, serverUrl]);

  useEffect(() => {
    setDraftProxyMode(proxyMode);
    setDraftCustomProxyUrl(customProxyUrl);
    setProxySaveError('');
  }, [customProxyUrl, proxyMode]);

  async function handleServerDisplayNameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await onServerDisplayNameSave(draftServerDisplayName.trim());
      setServerSaveError('');
    } catch {
      setServerSaveError('Could not save the server name. Try again.');
    }
  }

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

        <section className="settings-group" aria-labelledby="settings-network-title">
          <h2 id="settings-network-title">网络与账户</h2>

          <div className="settings-list">
            <form
              className="settings-row settings-row--form"
              onSubmit={(event) => void handleServerDisplayNameSubmit(event)}
            >
              <span className="settings-row__icon" aria-hidden="true">
                🏷
              </span>
              <div className="settings-row__body">
                <h3>服务器显示名称</h3>
                <p>用于侧边栏服务器列表的名称</p>
              </div>
              <div className="settings-row__control">
                <label className="sr-only" htmlFor="server-display-name">
                  Server display name
                </label>
                <input
                  id="server-display-name"
                  name="server-display-name"
                  type="text"
                  value={draftServerDisplayName}
                  onChange={(event) => {
                    setDraftServerDisplayName(event.target.value);
                    setIsDraftDirty(true);
                    setServerSaveError('');
                  }}
                />
                <button type="submit" aria-label="Save server name">
                  保存
                </button>
                {serverSaveError ? <p role="alert">{serverSaveError}</p> : null}
              </div>
            </form>

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
              <button className="settings-danger-button" type="button" onClick={onLogout} aria-label="Sign out">
                退出
              </button>
            </div>
          </div>
        </section>
      </section>
    </Layout>
  );
}
