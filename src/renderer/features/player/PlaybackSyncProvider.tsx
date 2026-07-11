import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { reportPlaybackProgress, reportPlaybackStarted, reportPlaybackStopped } from '@shared/api/emby/playback';
import { useAuth } from '@renderer/features/auth/AuthContext';
import { PlaybackSyncCoordinator, type PlaybackReportContext } from './playbackSync';

interface Value { registerPlaybackContext: (context: PlaybackReportContext) => void }
const Context = createContext<Value | null>(null);

export function PlaybackSyncProvider({ children }: { children: ReactNode }) {
  const { activeAccount, isHydrated } = useAuth();
  const coordinatorRef = useRef<PlaybackSyncCoordinator | null>(null);
  if (!coordinatorRef.current) {
    coordinatorRef.current = new PlaybackSyncCoordinator({
      readState: () => window.embyDesktop.storage.read(),
      writeState: (patch) => window.embyDesktop.storage.write(patch),
      reportStarted: (input) => window.embyDesktop.playback?.reportStarted(input) ?? reportPlaybackStarted(input),
      reportProgress: (input) => window.embyDesktop.playback?.reportProgress(input) ?? reportPlaybackProgress(input),
      reportStopped: (input) => window.embyDesktop.playback?.reportStopped(input) ?? reportPlaybackStopped(input),
    });
  }
  useEffect(() => {
    const subscribe = window.embyDesktop?.player?.onPlaybackEvent;
    if (typeof subscribe !== 'function') return undefined;
    return subscribe((event) => { void coordinatorRef.current?.handleEvent(event); });
  }, []);
  useEffect(() => {
    if (isHydrated && activeAccount) void coordinatorRef.current?.retryPendingForAccount(activeAccount);
  }, [activeAccount?.id, isHydrated]);
  useEffect(() => {
    if (!isHydrated || !activeAccount) return undefined;
    const retry = () => { void coordinatorRef.current?.retryPendingForAccount(activeAccount); };
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [activeAccount?.id, isHydrated]);
  const registerPlaybackContext = useCallback((context: PlaybackReportContext) => coordinatorRef.current?.registerContext(context), []);
  return <Context.Provider value={{ registerPlaybackContext }}>{children}</Context.Provider>;
}

export function usePlaybackSync(): Value {
  const value = useContext(Context);
  if (!value) throw new Error('usePlaybackSync must be used within PlaybackSyncProvider');
  return value;
}
