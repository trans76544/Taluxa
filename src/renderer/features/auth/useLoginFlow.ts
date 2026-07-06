import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SavedAccount } from '@shared/models/session';
import { createAccountId } from '@shared/store/persistence';
import { normalizeServerUrl } from '@shared/utils/normalizeServerUrl';
import { useAuth } from './AuthContext';
import type { LoginFormValues } from './LoginPage';

function mergeSavedAccounts(currentAccounts: SavedAccount[], nextAccount: SavedAccount) {
  const accountsById = new Map<string, SavedAccount>();

  for (const account of currentAccounts) {
    accountsById.set(account.id, account);
  }

  accountsById.set(nextAccount.id, nextAccount);

  return Array.from(accountsById.values());
}

export function useLoginFlow({ onSuccess }: { onSuccess?: () => void } = {}) {
  const navigate = useNavigate();
  const { accounts, upsertAccount } = useAuth();
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit({ serverUrl, userName, password }: LoginFormValues) {
    try {
      const desktopBridge = window.embyDesktop;
      const storageBridge = desktopBridge?.storage;
      const authBridge = desktopBridge?.auth;

      if (!storageBridge?.write || !authBridge?.login) {
        setErrorMessage('Desktop integration is unavailable. Restart the app and try again.');
        return;
      }

      const normalizedServerUrl = normalizeServerUrl(serverUrl);
      const session = await authBridge.login({
        serverUrl: normalizedServerUrl,
        userName,
        password,
      });
      const accountId = createAccountId(normalizedServerUrl, session.userId);
      const savedAccount: SavedAccount = {
        id: accountId,
        serverUrl: normalizedServerUrl,
        userId: session.userId,
        userName: session.userName,
        accessToken: session.accessToken,
        lastUsedAt: new Date().toISOString(),
      };

      const nextState = {
        accounts: mergeSavedAccounts(accounts, savedAccount),
        activeAccountId: accountId,
      };

      try {
        await storageBridge.write(nextState);
      } catch {
        setErrorMessage('Could not save your session. Try again.');
        return;
      }

      upsertAccount(savedAccount);
      setErrorMessage('');
      onSuccess?.();
      navigate('/libraries');
    } catch {
      setErrorMessage('Sign in failed. Check your server URL and credentials.');
    }
  }

  return {
    accounts,
    errorMessage,
    handleSubmit,
    setErrorMessage,
  };
}
