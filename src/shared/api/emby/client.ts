import { normalizeServerUrl } from '@shared/utils/normalizeServerUrl';
import {
  DEFAULT_NETWORK_TIMEOUT_MS,
  type NetworkOperation,
  type NetworkOperationFailureStatus,
} from '@shared/models/network';
import { redactErrorMessage, redactSensitiveValue } from '@shared/network/redaction';

export interface EmbyRequestInit extends RequestInit {
  accessToken?: string;
  fetcher?: EmbyFetch;
  operation?: NetworkOperation;
  retryable?: boolean;
  timeoutMs?: number;
}

export type EmbyFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const EMBY_AUTH_HEADER =
  'Emby Client="Taluxa", Device="Windows Desktop", DeviceId="taluxa-desktop", Version="0.1.0"';

export class EmbyRequestError extends Error {
  readonly canRetry: boolean;

  readonly operation: NetworkOperation;

  readonly status: NetworkOperationFailureStatus;

  constructor(args: {
    canRetry: boolean;
    message: string;
    operation: NetworkOperation;
    status: NetworkOperationFailureStatus;
  }) {
    super(args.message);
    this.name = 'EmbyRequestError';
    this.canRetry = args.canRetry;
    this.operation = args.operation;
    this.status = args.status;
  }
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === 'AbortError' ||
    error instanceof Error && error.name === 'AbortError'
  );
}

function createRequestSignal(
  callerSignal: AbortSignal | null | undefined,
  timeoutMs: number
): { clear: () => void; signal: AbortSignal; timedOut: () => boolean } {
  const controller = new AbortController();
  let didTimeout = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const abortFromCaller = () => {
    controller.abort();
  };

  if (callerSignal?.aborted) {
    controller.abort();
  } else {
    callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
  }

  timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  return {
    clear: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      callerSignal?.removeEventListener('abort', abortFromCaller);
    },
    signal: controller.signal,
    timedOut: () => didTimeout,
  };
}

function toRequestError(args: {
  error: unknown;
  operation: NetworkOperation;
  requestUrl: string;
  retryable: boolean;
  timedOut: boolean;
}): EmbyRequestError {
  const status: NetworkOperationFailureStatus = args.timedOut
    ? 'timeout'
    : isAbortError(args.error)
      ? 'cancelled'
      : 'failed';
  const canRetry = status === 'cancelled' ? false : args.retryable;
  const message =
    status === 'timeout'
      ? `${args.operation} request timed out for ${redactSensitiveValue(args.requestUrl)}`
      : `${args.operation} request failed for ${redactSensitiveValue(args.requestUrl)} (${redactErrorMessage(args.error)})`;

  return new EmbyRequestError({
    canRetry,
    message,
    operation: args.operation,
    status,
  });
}

export function createEmbyRequest(
  serverUrl: string,
  path: string,
  init: EmbyRequestInit = {}
): Promise<Response> {
  const {
    accessToken,
    fetcher = fetch,
    operation = 'library',
    retryable = true,
    timeoutMs = DEFAULT_NETWORK_TIMEOUT_MS[operation],
    ...requestInit
  } = init;
  const normalizedServerUrl = normalizeServerUrl(serverUrl);
  if (!normalizedServerUrl) {
    throw new Error('Server URL is required');
  }

  const requestUrl = new URL(
    path,
    normalizedServerUrl.endsWith('/') ? normalizedServerUrl : `${normalizedServerUrl}/`
  ).toString();
  const headers = new Headers(init.headers);

  headers.set('X-Emby-Authorization', EMBY_AUTH_HEADER);

  if (accessToken) {
    headers.set('X-Emby-Token', accessToken);
  }

  const requestSignal = createRequestSignal(requestInit.signal, timeoutMs);

  return fetcher(requestUrl, {
    ...requestInit,
    headers,
    signal: requestSignal.signal,
  })
    .catch((error) => {
      throw toRequestError({
        error,
        operation,
        requestUrl,
        retryable,
        timedOut: requestSignal.timedOut(),
      });
    })
    .finally(requestSignal.clear);
}
