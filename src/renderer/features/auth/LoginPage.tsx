import { useState, type FormEvent } from 'react';

export interface LoginFormValues {
  serverUrl: string;
  userName: string;
  password: string;
}

export interface LoginPageProps {
  onSubmit: (values: LoginFormValues) => void | Promise<void>;
  hasRememberedAccounts?: boolean;
}

export function LoginPage({ onSubmit, hasRememberedAccounts = false }: LoginPageProps) {
  const [serverUrl, setServerUrl] = useState('');
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

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
      <section className="panel" aria-label="Taluxa sign in">
        <p className="eyebrow">Taluxa</p>
        <h1>Sign in</h1>
        <p>
          {hasRememberedAccounts
            ? 'Add another account from this or another server.'
            : 'Connect to your server and unlock your library.'}
        </p>

        <form className="stack login-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Server URL</span>
            <input
              className="field-input"
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
              className="field-input"
              value={userName}
              onChange={(event) => setUserName(event.target.value)}
              type="text"
              name="userName"
              autoComplete="username"
            />
          </label>

          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="password-field">
              <input
                id="password"
                className="field-input password-field__input"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type={isPasswordVisible ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
              />
              <button
                className="password-field__toggle"
                type="button"
                aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
                aria-pressed={isPasswordVisible}
                onClick={() => setIsPasswordVisible((current) => !current)}
              >
                {isPasswordVisible ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button className="primary-button" type="submit">
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}
