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
      <dl>
        <dt>Active account</dt>
        <dd>{userName}</dd>
        <dt>Server URL</dt>
        <dd>{serverUrl}</dd>
        <dt>Default volume</dt>
        <dd>{Math.round(defaultVolume * 100)}%</dd>
      </dl>

      <form onSubmit={(event) => void handleServerDisplayNameSubmit(event)}>
        <label htmlFor="server-display-name">Server display name</label>
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

        <button type="submit">Save server name</button>
      </form>

      {serverSaveError ? <p role="alert">{serverSaveError}</p> : null}

      <form noValidate onSubmit={(event) => void handleProxySettingsSubmit(event)}>
        <fieldset>
          <legend>Proxy</legend>

          <label htmlFor="proxy-mode-system">
            <input
              id="proxy-mode-system"
              name="proxy-mode"
              type="radio"
              checked={draftProxyMode === 'system'}
              onChange={() => {
                setDraftProxyMode('system');
                setProxySaveError('');
              }}
            />
            Use Windows system proxy
          </label>

          <label htmlFor="proxy-mode-direct">
            <input
              id="proxy-mode-direct"
              name="proxy-mode"
              type="radio"
              checked={draftProxyMode === 'direct'}
              onChange={() => {
                setDraftProxyMode('direct');
                setProxySaveError('');
              }}
            />
            Direct connection
          </label>

          <label htmlFor="proxy-mode-custom">
            <input
              id="proxy-mode-custom"
              name="proxy-mode"
              type="radio"
              checked={draftProxyMode === 'custom'}
              onChange={() => {
                setDraftProxyMode('custom');
                setProxySaveError('');
              }}
            />
            Custom proxy
          </label>
        </fieldset>

        {draftProxyMode === 'custom' ? (
          <>
            <label htmlFor="custom-proxy-url">Custom proxy URL</label>
            <input
              id="custom-proxy-url"
              name="custom-proxy-url"
              type="url"
              value={draftCustomProxyUrl}
              onChange={(event) => {
                setDraftCustomProxyUrl(event.target.value);
                setProxySaveError('');
              }}
            />
          </>
        ) : null}

        <button type="submit">Save proxy settings</button>
      </form>

      {proxySaveError ? <p role="alert">{proxySaveError}</p> : null}

      <button type="button" onClick={onLogout}>
        Sign out
      </button>
    </Layout>
  );
}
