export type NetworkOperation =
  | 'login'
  | 'server-info'
  | 'home'
  | 'library'
  | 'image'
  | 'playback-info'
  | 'playback-preflight'
  | 'progress'
  | 'user-data';

export interface NetworkOperationPolicy {
  operation: NetworkOperation;
  timeoutMs?: number;
  retryable?: boolean;
  fallback?: 'none' | 'cache' | 'local-state';
  signal?: AbortSignal;
}

export type NetworkOperationFailureStatus = 'timeout' | 'cancelled' | 'failed';

export interface NetworkOperationFailure {
  operation: NetworkOperation;
  status: NetworkOperationFailureStatus;
  message: string;
  canRetry: boolean;
}

export const DEFAULT_NETWORK_TIMEOUT_MS: Record<NetworkOperation, number> = {
  login: 10000,
  'server-info': 10000,
  home: 10000,
  library: 10000,
  image: 8000,
  'playback-info': 12000,
  'playback-preflight': 12000,
  progress: 5000,
  'user-data': 5000,
};
