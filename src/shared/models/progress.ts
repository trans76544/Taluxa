export interface PlaybackProgress {
  itemId: string;
  positionSeconds: number;
  durationSeconds: number;
  updatedAt: string;
  serverStatus?: 'pending' | 'confirmed' | 'failed';
  lastServerAttemptAt?: string;
  lastServerConfirmedAt?: string;
  retryCount?: number;
  final?: boolean;
  errorMessage?: string;
}
