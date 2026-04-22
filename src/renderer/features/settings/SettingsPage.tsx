import { useEffect, useState, type FormEvent } from 'react';
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

  useEffect(() => {
    setDraftServerDisplayName(serverDisplayName);
  }, [serverDisplayName]);

  async function handleServerDisplayNameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onServerDisplayNameSave(draftServerDisplayName.trim());
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
          onChange={(event) => setDraftServerDisplayName(event.target.value)}
        />

        <button type="submit">Save server name</button>
      </form>

      <button type="button" onClick={onLogout}>
        Sign out
      </button>
    </Layout>
  );
}
