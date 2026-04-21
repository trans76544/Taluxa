import type { ReactNode } from 'react';
import { AuthProvider } from '@renderer/features/auth/AuthContext';

export function AppProviders({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
