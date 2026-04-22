import { Layout } from '@renderer/components/Layout';

interface SettingsPageProps {
  userName?: string;
  serverUrl: string;
  defaultVolume: number;
  onLogout: () => void;
}

export function SettingsPage({
  userName = 'Unknown user',
  serverUrl,
  defaultVolume,
  onLogout,
}: SettingsPageProps) {
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

      <button type="button" onClick={onLogout}>
        Sign out
      </button>
    </Layout>
  );
}
