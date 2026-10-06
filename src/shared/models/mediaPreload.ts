export interface NextEpisodeMediaPreloadInput {
  playerSessionId: number;
  currentItemId: string;
  itemId: string;
  streamUrl: string;
  httpHeaders?: Record<string, string>;
  startSeconds?: number;
}

export function isNextEpisodeMediaPreloadInput(value: unknown): value is NextEpisodeMediaPreloadInput {
  if (!value || typeof value !== 'object') return false;
  const input = value as Partial<NextEpisodeMediaPreloadInput>;
  if (!Number.isSafeInteger(input.playerSessionId) || (input.playerSessionId ?? 0) <= 0 ||
      typeof input.currentItemId !== 'string' || !input.currentItemId.trim() ||
      typeof input.itemId !== 'string' || !input.itemId.trim() || input.currentItemId === input.itemId ||
      typeof input.streamUrl !== 'string') return false;
  try { if (!['http:', 'https:'].includes(new URL(input.streamUrl).protocol)) return false; } catch { return false; }
  if (input.startSeconds !== undefined && (!Number.isFinite(input.startSeconds) || input.startSeconds < 0)) return false;
  if (input.httpHeaders !== undefined && (!input.httpHeaders || typeof input.httpHeaders !== 'object' || Array.isArray(input.httpHeaders) ||
      Object.entries(input.httpHeaders).some(([name, content]) => !/^[!#$%&'*+.^_`|~\w-]+$/.test(name) || typeof content !== 'string' || /[\r\n]/.test(content)))) return false;
  return true;
}
