import { createHash } from 'node:crypto';
import type { DanmakuServerSettings } from '@shared/models/settings';

export type DanmakuMode = 'scroll' | 'top' | 'bottom';

export interface DanmakuFetchInput {
  itemId: string;
  title: string;
}

export interface DanmakuComment {
  color: number;
  mode: DanmakuMode;
  text: string;
  timeSeconds: number;
}

type DanmakuFetch = (input: string, init?: RequestInit) => Promise<Response>;

interface DanmakuFetchOptions {
  fetcher?: DanmakuFetch;
  nowSeconds?: () => number;
}

interface DandanplayMatchResponse {
  success?: boolean;
  isMatched?: boolean;
  matches?: Array<{
    episodeId?: number | string | null;
  }>;
}

interface DandanplayCommentResponse {
  comments?: Array<{
    cid?: number | string;
    p?: string;
    m?: string;
  }>;
}

type DandanplayCommentPayload = NonNullable<DandanplayCommentResponse['comments']>[number];

const SCROLL_DURATION_SECONDS = 12;
const FIXED_DURATION_SECONDS = 5;
const ASS_WIDTH = 1920;
const ASS_HEIGHT = 1080;

export function normalizeDanmakuServers(
  servers: DanmakuServerSettings[] = []
): DanmakuServerSettings[] {
  return servers
    .map((server) => ({
      ...server,
      name: server.name.trim() || server.url.trim(),
      url: server.url.trim().replace(/\/+$/u, ''),
      appId: server.appId?.trim() ?? '',
      appSecret: server.appSecret?.trim() ?? '',
    }))
    .filter((server) => server.enabled && server.url.length > 0);
}

function createAuthenticationHeaders(
  server: DanmakuServerSettings,
  pathName: string,
  nowSeconds: () => number
): Record<string, string> {
  const appId = server.appId?.trim();
  const appSecret = server.appSecret?.trim();

  if (!appId || !appSecret) {
    return {};
  }

  const timestamp = String(Math.floor(nowSeconds()));
  const signature = createHash('sha256')
    .update(`${appId}${timestamp}${pathName}${appSecret}`)
    .digest('base64');

  return {
    'X-AppId': appId,
    'X-Timestamp': timestamp,
    'X-Signature': signature,
  };
}

function createApiUrl(server: DanmakuServerSettings, pathName: string, search = ''): string {
  return `${server.url}${pathName}${search}`;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Danmaku request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

function parseEpisodeId(payload: DandanplayMatchResponse): string | null {
  if (payload.success === false || payload.isMatched === false) {
    return null;
  }

  const episodeId = payload.matches?.[0]?.episodeId;

  if (typeof episodeId === 'number' && Number.isFinite(episodeId)) {
    return String(Math.floor(episodeId));
  }

  if (typeof episodeId === 'string' && episodeId.trim()) {
    return episodeId.trim();
  }

  return null;
}

function parseCommentMode(mode: number): DanmakuMode {
  if (mode === 5) {
    return 'top';
  }

  if (mode === 4) {
    return 'bottom';
  }

  return 'scroll';
}

function parseComment(value: DandanplayCommentPayload): DanmakuComment | null {
  const parts = value.p?.split(',') ?? [];
  const timeSeconds = Number(parts[0]);
  const mode = Number(parts[1]);
  const color = Number(parts[3]);
  const text = value.m?.trim() ?? '';

  if (!Number.isFinite(timeSeconds) || timeSeconds < 0 || !text) {
    return null;
  }

  return {
    color: Number.isFinite(color) ? Math.max(0, Math.floor(color)) : 0xffffff,
    mode: parseCommentMode(mode),
    text,
    timeSeconds,
  };
}

async function fetchFromServer(
  input: DanmakuFetchInput,
  server: DanmakuServerSettings,
  fetcher: DanmakuFetch,
  nowSeconds: () => number
): Promise<DanmakuComment[]> {
  const matchPath = '/api/v2/match';
  const matchResponse = await fetcher(createApiUrl(server, matchPath), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...createAuthenticationHeaders(server, matchPath, nowSeconds),
    },
    body: JSON.stringify({
      fileName: input.title,
      fileHash: '',
      fileSize: 0,
      videoDuration: 0,
      matchMode: 'fileNameOnly',
    }),
  });
  const matchPayload = await readJson<DandanplayMatchResponse>(matchResponse);
  const episodeId = parseEpisodeId(matchPayload);

  if (!episodeId) {
    return [];
  }

  const commentPath = `/api/v2/comment/${encodeURIComponent(episodeId)}`;
  const commentResponse = await fetcher(
    createApiUrl(server, commentPath, '?withRelated=true'),
    {
      method: 'GET',
      headers: createAuthenticationHeaders(server, commentPath, nowSeconds),
    }
  );
  const commentPayload = await readJson<DandanplayCommentResponse>(commentResponse);

  return (commentPayload.comments ?? [])
    .map(parseComment)
    .filter((comment): comment is DanmakuComment => comment !== null)
    .sort((left, right) => left.timeSeconds - right.timeSeconds);
}

export async function fetchDandanplayDanmaku(
  input: DanmakuFetchInput,
  servers: DanmakuServerSettings[],
  options: DanmakuFetchOptions = {}
): Promise<DanmakuComment[]> {
  const fetcher = options.fetcher ?? fetch;
  const nowSeconds = options.nowSeconds ?? (() => Date.now() / 1000);

  for (const server of normalizeDanmakuServers(servers)) {
    try {
      const comments = await fetchFromServer(input, server, fetcher, nowSeconds);

      if (comments.length > 0) {
        return comments;
      }
    } catch {
      // Try the next configured danmaku source.
    }
  }

  return [];
}

function formatAssTime(timeSeconds: number): string {
  const centiseconds = Math.max(0, Math.round(timeSeconds * 100));
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor((centiseconds % 360000) / 6000);
  const seconds = Math.floor((centiseconds % 6000) / 100);
  const centisecondPart = centiseconds % 100;

  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(
    centisecondPart
  ).padStart(2, '0')}`;
}

function toAssBgrColor(rgbColor: number): string {
  const normalized = Math.max(0, Math.min(0xffffff, Math.floor(rgbColor)));
  const red = normalized & 0xff;
  const green = (normalized >> 8) & 0xff;
  const blue = (normalized >> 16) & 0xff;

  return `&H${blue.toString(16).padStart(2, '0')}${green
    .toString(16)
    .padStart(2, '0')}${red.toString(16).padStart(2, '0')}&`.toUpperCase();
}

function escapeAssText(value: string): string {
  return value.replace(/[\\{}]/gu, (match) => `\\${match}`).replace(/\r?\n/gu, ' ');
}

function createDialogue(comment: DanmakuComment, index: number): string {
  const start = comment.timeSeconds;
  const duration =
    comment.mode === 'scroll' ? SCROLL_DURATION_SECONDS : FIXED_DURATION_SECONDS;
  const end = start + duration;
  const color = toAssBgrColor(comment.color);
  const text = escapeAssText(comment.text);

  if (comment.mode === 'top') {
    const y = 72 + (index % 8) * 42;
    return `Dialogue: 0,${formatAssTime(start)},${formatAssTime(
      end
    )},Top,,0,0,0,,{\\c${color}\\an8\\pos(${ASS_WIDTH / 2},${y})}${text}`;
  }

  if (comment.mode === 'bottom') {
    const y = ASS_HEIGHT - 120 - (index % 6) * 42;
    return `Dialogue: 0,${formatAssTime(start)},${formatAssTime(
      end
    )},Bottom,,0,0,0,,{\\c${color}\\an2\\pos(${ASS_WIDTH / 2},${y})}${text}`;
  }

  const y = 88 + (index % 12) * 46;
  return `Dialogue: 0,${formatAssTime(start)},${formatAssTime(
    end
  )},Scroll,,0,0,0,,{\\c${color}\\move(${ASS_WIDTH + 80},${y},-420,${y})}${text}`;
}

export function toAssSubtitle(comments: DanmakuComment[]): string {
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${ASS_WIDTH}`,
    `PlayResY: ${ASS_HEIGHT}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Scroll,Microsoft YaHei UI,34,&H00FFFFFF,&H00FFFFFF,&H96000000,&H00000000,1,0,0,0,100,100,0,0,1,2,0,7,0,0,0,1',
    'Style: Top,Microsoft YaHei UI,34,&H00FFFFFF,&H00FFFFFF,&H96000000,&H00000000,1,0,0,0,100,100,0,0,1,2,0,8,0,0,0,1',
    'Style: Bottom,Microsoft YaHei UI,34,&H00FFFFFF,&H00FFFFFF,&H96000000,&H00000000,1,0,0,0,100,100,0,0,1,2,0,2,0,0,0,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...comments.map(createDialogue),
    '',
  ].join('\n');
}
