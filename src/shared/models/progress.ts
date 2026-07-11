import type { LibraryImageCandidate } from './library';

export interface PlaybackResumeItemSnapshot {
  itemId: string;
  itemType: string;
  title: string;
  posterUrl: string;
  imageCandidates: LibraryImageCandidate[];
  productionYear?: number;
  seriesId?: string;
  seriesName?: string;
  seasonId?: string;
  seasonIndex?: number;
  episodeIndex?: number;
}

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
  playbackId?: string;
  sequence?: number;
  resumeItem?: PlaybackResumeItemSnapshot;
  pendingOperation?: 'progress' | 'stopped';
  completed?: boolean;
  playSessionId?: string;
  mediaSourceId?: string;
  playMethod?: 'DirectPlay' | 'DirectStream' | 'Transcode';
  audioStreamIndex?: number;
}
