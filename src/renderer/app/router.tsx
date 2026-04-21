import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { login } from '@shared/api/emby/auth';
import { fetchItems, fetchViews } from '@shared/api/emby/library';
import { normalizeServerUrl } from '@shared/utils/normalizeServerUrl';
import { useAuth } from '@renderer/features/auth/AuthContext';
import { LoginPage } from '@renderer/features/auth/LoginPage';
import { Layout } from '@renderer/components/Layout';
import { LibraryItemsPage } from '@renderer/features/library/LibraryItemsPage';
import { LibraryViewsPage } from '@renderer/features/library/LibraryViewsPage';
import type { LibraryItem, LibraryView } from '@shared/models/library';

function HomeGate() {
  const { isHydrated, session } = useAuth();

  if (!isHydrated) {
    return null;
  }

  return <Navigate to={session ? '/libraries' : '/login'} replace />;
}

function LibrariesGate() {
  const { isHydrated, session } = useAuth();

  if (!isHydrated) {
    return null;
  }

  return session ? <LibrariesRoute /> : <Navigate to="/login" replace />;
}

function LibraryItemsGate() {
  const { isHydrated, session } = useAuth();

  if (!isHydrated) {
    return null;
  }

  return session ? <LibraryItemsRoute /> : <Navigate to="/login" replace />;
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

      try {
        await window.embyDesktop.storage.write(nextState);
      } catch {
        setErrorMessage('Could not save your session. Try again.');
        return;
      }

      setAuthState(nextState);
      setErrorMessage('');
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
  const { serverUrl, session } = useAuth();
  const [views, setViews] = useState<LibraryView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!session) {
      setViews([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    setIsLoading(true);
    setErrorMessage('');

    fetchViews(serverUrl, session.userId, session.accessToken)
      .then((nextViews) => {
        if (!cancelled) {
          setViews(nextViews);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMessage('Could not load your libraries.');
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [serverUrl, session]);

  return (
    <Layout>
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      {isLoading ? <p>Loading libraries...</p> : <LibraryViewsPage views={views} />}
    </Layout>
  );
}

function LibraryItemsRoute() {
  const { serverUrl, session } = useAuth();
  const { viewId = '' } = useParams();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!session || !viewId) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    setIsLoading(true);
    setErrorMessage('');

    fetchItems(serverUrl, session.userId, viewId, session.accessToken)
      .then((nextItems) => {
        if (!cancelled) {
          setItems(nextItems);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMessage('Could not load this library.');
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [serverUrl, session, viewId]);

  return (
    <Layout title={viewId || 'Library'}>
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      {isLoading ? (
        <p>Loading items...</p>
      ) : (
        <LibraryItemsPage libraryName={viewId || 'Library'} items={items} />
      )}
    </Layout>
  );
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomeGate />} />
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/libraries" element={<LibrariesGate />} />
      <Route path="/libraries/:viewId" element={<LibraryItemsGate />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
