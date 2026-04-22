import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Layout } from '@renderer/components/Layout';

interface SettingsPageProps {
  userName?: string;
  serverUrl: string;
  serverDisplayName: string;
  defaultVolume: number;
  onServerDisplayNameSave: (nextName: string) => void | Promise<void>;
  onLogout: () => void;
}

export function SettingsPage({
  userName = 'Unknown user',
  serverUrl,
  serverDisplayName,
  defaultVolume,
  onServerDisplayNameSave,
  onLogout,
}: SettingsPageProps) {
  const [draftServerDisplayName, setDraftServerDisplayName] = useState(serverDisplayName);
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  const [saveError, setSaveError] = useState('');
  const lastServerUrlRef = useRef(serverUrl);

  useEffect(() => {
    const serverChanged = lastServerUrlRef.current !== serverUrl;
    lastServerUrlRef.current = serverUrl;

    if (serverChanged || !isDraftDirty || draftServerDisplayName === serverDisplayName) {
      setDraftServerDisplayName(serverDisplayName);
      setIsDraftDirty(false);
      setSaveError('');
    }
  }, [draftServerDisplayName, isDraftDirty, serverDisplayName, serverUrl]);

  async function handleServerDisplayNameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await onServerDisplayNameSave(draftServerDisplayName.trim());
      setSaveError('');
    } catch {
      setSaveError('Could not save the server name. Try again.');
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
            setSaveError('');
          }}
        />

        <button type="submit">Save server name</button>
      </form>

      {saveError ? <p role="alert">{saveError}</p> : null}

      <button type="button" onClick={onLogout}>
        Sign out
      </button>
    </Layout>
  );
}
