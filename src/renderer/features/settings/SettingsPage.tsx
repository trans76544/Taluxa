import { Layout } from '@renderer/components/Layout';

interface SettingsPageProps {
  serverUrl: string;
  defaultVolume: number;
  onLogout: () => void;
}

export function SettingsPage({ serverUrl, defaultVolume, onLogout }: SettingsPageProps) {
  return (
    <Layout title="Settings">
      <dl>
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
