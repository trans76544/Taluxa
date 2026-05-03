import { createHash } from 'node:crypto';
import type { DanmakuServerSettings, DanmakuSettings } from '@shared/models/settings';

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
type DanmakuLogger = (message: string) => void;

interface DanmakuFetchOptions {
  fetcher?: DanmakuFetch;
  logger?: DanmakuLogger;
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
const BASE_FONT_SIZE = 34;

export class DanmakuSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DanmakuSourceError';
  }
}

export function formatDanmakuDiagnosticText(value: string): string {
  return value
    .replace(/\r/gu, '\\r')
    .replace(/\n/gu, '\\n')
    .replace(/[^\x20-\x7e]/gu, (character) => {
      const codePoint = character.codePointAt(0) ?? 0;

      if (codePoint <= 0xffff) {
        return `\\u${codePoint.toString(16).padStart(4, '0')}`;
      }

      return `\\u{${codePoint.toString(16)}}`;
    });
}

export type DanmakuRenderOptions = Partial<
  Pick<
    DanmakuSettings,
    | 'scrollMaxLines'
    | 'topMaxLines'
    | 'bottomMaxLines'
    | 'scale'
    | 'opacity'
    | 'speed'
    | 'bold'
    | 'blocklist'
  >
>;

interface NormalizedDanmakuRenderOptions {
  blocklist: string[];
  bold: boolean;
  bottomMaxLines: number;
  fontSize: number;
  opacity: number;
  scrollDurationSeconds: number;
  scrollMaxLines: number;
  topMaxLines: number;
}

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
  logger: DanmakuLogger | undefined,
  nowSeconds: () => number
): Promise<DanmakuComment[]> {
  const matchPath = '/api/v2/match';
  const serverName = formatDanmakuDiagnosticText(server.name || server.url);
  logger?.(
    `[danmaku][dandanplay] match request server=${serverName} fileName=${formatDanmakuDiagnosticText(
      input.title
    )}`
  );
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
  logger?.(
    `[danmaku][dandanplay] match result server=${serverName} success=${
      matchPayload.success ?? 'unknown'
    } matched=${matchPayload.isMatched ?? 'unknown'} episodeId=${
      episodeId ?? 'none'
    } matches=${matchPayload.matches?.length ?? 0}`
  );

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
  const comments = (commentPayload.comments ?? [])
    .map(parseComment)
    .filter((comment): comment is DanmakuComment => comment !== null)
    .sort((left, right) => left.timeSeconds - right.timeSeconds);

  logger?.(
    `[danmaku][dandanplay] comments fetched server=${serverName} episodeId=${formatDanmakuDiagnosticText(
      episodeId
    )} comments=${comments.length}`
  );

  return comments;
}

export async function fetchDandanplayDanmaku(
  input: DanmakuFetchInput,
  servers: DanmakuServerSettings[],
  options: DanmakuFetchOptions = {}
): Promise<DanmakuComment[]> {
  const fetcher = options.fetcher ?? fetch;
  const logger = options.logger;
  const nowSeconds = options.nowSeconds ?? (() => Date.now() / 1000);
  const sourceFailures: string[] = [];
  let didReceiveSourceResponse = false;

  for (const server of normalizeDanmakuServers(servers)) {
    try {
      const comments = await fetchFromServer(input, server, fetcher, logger, nowSeconds);
      didReceiveSourceResponse = true;

      if (comments.length > 0) {
        return comments;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sourceFailures.push(message);
      logger?.(
        `[danmaku][dandanplay] server failed server=${formatDanmakuDiagnosticText(
          server.name || server.url
        )} error=${formatDanmakuDiagnosticText(message)}`
      );
      // Try the next configured danmaku source.
    }
  }

  if (!didReceiveSourceResponse && sourceFailures.length > 0) {
    throw new DanmakuSourceError(`Danmaku sources failed (${sourceFailures.join('; ')})`);
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

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, value ?? fallback));
}

function clampInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  return Math.round(clampNumber(value, min, max, fallback));
}

function normalizeRenderOptions(
  options: DanmakuRenderOptions = {}
): NormalizedDanmakuRenderOptions {
  const scale = clampNumber(options.scale, 0.5, 3, 1);
  const speed = clampNumber(options.speed, 0.25, 4, 1);

  return {
    blocklist: Array.isArray(options.blocklist) ? options.blocklist : [],
    bold: options.bold ?? true,
    bottomMaxLines: clampInteger(options.bottomMaxLines, 1, 12, 6),
    fontSize: Math.round(BASE_FONT_SIZE * scale),
    opacity: clampNumber(options.opacity, 0, 1, 1),
    scrollDurationSeconds: SCROLL_DURATION_SECONDS / speed,
    scrollMaxLines: clampInteger(options.scrollMaxLines, 1, 24, 12),
    topMaxLines: clampInteger(options.topMaxLines, 1, 12, 8),
  };
}

function toAssAlpha(opacity: number): string {
  return Math.round((1 - opacity) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
}

function parseRegexBlocklistEntry(entry: string): RegExp | null {
  const match = entry.match(/^\/(.+)\/([dgimsuvy]*)$/u);

  if (!match) {
    return null;
  }

  try {
    return new RegExp(match[1], match[2]);
  } catch {
    return null;
  }
}

function isCommentBlocked(comment: DanmakuComment, blocklist: string[]): boolean {
  const text = comment.text;
  const normalizedText = text.toLocaleLowerCase();

  for (const rawEntry of blocklist) {
    const entry = rawEntry.trim();

    if (!entry) {
      continue;
    }

    const regex = parseRegexBlocklistEntry(entry);

    if (regex) {
      if (regex.test(text)) {
        return true;
      }
      continue;
    }

    if (normalizedText.includes(entry.toLocaleLowerCase())) {
      return true;
    }
  }

  return false;
}

function createDialogue(
  comment: DanmakuComment,
  lineIndex: number,
  options: NormalizedDanmakuRenderOptions
): string {
  const start = comment.timeSeconds;
  const duration = comment.mode === 'scroll' ? options.scrollDurationSeconds : FIXED_DURATION_SECONDS;
  const end = start + duration;
  const color = toAssBgrColor(comment.color);
  const text = escapeAssText(comment.text);

  if (comment.mode === 'top') {
    const y = 72 + (lineIndex % options.topMaxLines) * 42;
    return `Dialogue: 0,${formatAssTime(start)},${formatAssTime(
      end
    )},Top,,0,0,0,,{\\c${color}\\an8\\pos(${ASS_WIDTH / 2},${y})}${text}`;
  }

  if (comment.mode === 'bottom') {
    const y = ASS_HEIGHT - 120 - (lineIndex % options.bottomMaxLines) * 42;
    return `Dialogue: 0,${formatAssTime(start)},${formatAssTime(
      end
    )},Bottom,,0,0,0,,{\\c${color}\\an2\\pos(${ASS_WIDTH / 2},${y})}${text}`;
  }

  const y = 88 + (lineIndex % options.scrollMaxLines) * 46;
  return `Dialogue: 0,${formatAssTime(start)},${formatAssTime(
    end
  )},Scroll,,0,0,0,,{\\c${color}\\move(${ASS_WIDTH + 80},${y},-420,${y})}${text}`;
}

function createDialogueLines(
  comments: DanmakuComment[],
  options: NormalizedDanmakuRenderOptions
): string[] {
  const lineCounters: Record<DanmakuMode, number> = {
    bottom: 0,
    scroll: 0,
    top: 0,
  };

  return comments
    .filter((comment) => !isCommentBlocked(comment, options.blocklist))
    .map((comment) => {
      const lineIndex = lineCounters[comment.mode];
      lineCounters[comment.mode] += 1;

      return createDialogue(comment, lineIndex, options);
    });
}

export function toAssSubtitle(
  comments: DanmakuComment[],
  renderOptions: DanmakuRenderOptions = {}
): string {
  const options = normalizeRenderOptions(renderOptions);
  const alpha = toAssAlpha(options.opacity);
  const textColor = `&H${alpha}00FFFFFF`;
  const boldValue = options.bold ? 1 : 0;

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
    `Style: Scroll,Microsoft YaHei UI,${options.fontSize},${textColor},${textColor},&H96000000,&H00000000,${boldValue},0,0,0,100,100,0,0,1,2,0,7,0,0,0,1`,
    `Style: Top,Microsoft YaHei UI,${options.fontSize},${textColor},${textColor},&H96000000,&H00000000,${boldValue},0,0,0,100,100,0,0,1,2,0,8,0,0,0,1`,
    `Style: Bottom,Microsoft YaHei UI,${options.fontSize},${textColor},${textColor},&H96000000,&H00000000,${boldValue},0,0,0,100,100,0,0,1,2,0,2,0,0,0,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...createDialogueLines(comments, options),
    '',
  ].join('\n');
}
