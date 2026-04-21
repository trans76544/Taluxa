import { useState, type FormEvent } from 'react';

export interface LoginFormValues {
  serverUrl: string;
  userName: string;
  password: string;
}

export interface LoginPageProps {
  onSubmit: (values: LoginFormValues) => void | Promise<void>;
}

export function LoginPage({ onSubmit }: LoginPageProps) {
  const [serverUrl, setServerUrl] = useState('');
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await onSubmit({
      serverUrl,
      userName,
      password,
    });
  }

  return (
    <main className="shell">
      <section className="panel" aria-label="Emby sign in">
        <p className="eyebrow">Emby Player</p>
        <h1>Sign in</h1>
        <p>Connect to your server and unlock your library.</p>

        <form className="stack" onSubmit={handleSubmit}>
          <label className="field">
            <span>Server URL</span>
            <input
              value={serverUrl}
              onChange={(event) => setServerUrl(event.target.value)}
              type="text"
              name="serverUrl"
              autoComplete="url"
            />
          </label>

          <label className="field">
            <span>Username</span>
            <input
              value={userName}
              onChange={(event) => setUserName(event.target.value)}
              type="text"
              name="userName"
              autoComplete="username"
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              name="password"
              autoComplete="current-password"
            />
          </label>

          <button type="submit">Sign in</button>
        </form>
      </section>
    </main>
  );
}
