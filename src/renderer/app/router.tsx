import { useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { login } from '@shared/api/emby/auth';
import { normalizeServerUrl } from '@shared/utils/normalizeServerUrl';
import { useAuth } from '@renderer/features/auth/AuthContext';
import { LoginPage } from '@renderer/features/auth/LoginPage';

function HomeGate() {
  const { session } = useAuth();

  return <Navigate to={session ? '/libraries' : '/login'} replace />;
}

function LoginRoute() {
  const navigate = useNavigate();
  const { setAuthState } = useAuth();
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit({
    serverUrl,
    userName,
    password,
  }: {
    serverUrl: string;
    userName: string;
    password: string;
  }) {
    try {
      const normalizedServerUrl = normalizeServerUrl(serverUrl);
      const session = await login({
        serverUrl: normalizedServerUrl,
        userName,
        password,
      });

      const nextState = {
        serverUrl: normalizedServerUrl,
        session,
      };

      setAuthState(nextState);
      setErrorMessage('');

      await window.embyDesktop.storage.write(nextState);
      navigate('/libraries');
    } catch {
      setErrorMessage('Sign in failed. Check your server URL and credentials.');
    }
  }

  return (
    <>
      <LoginPage onSubmit={handleSubmit} />
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
    </>
  );
}

function LibrariesRoute() {
  return (
    <main className="shell">
      <section className="panel" aria-label="Libraries placeholder">
        <p className="eyebrow">Emby Player</p>
        <h1>Libraries</h1>
        <p>Library browsing will land here next.</p>
      </section>
    </main>
  );
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomeGate />} />
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/libraries" element={<LibrariesRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
