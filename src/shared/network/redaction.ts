const SENSITIVE_KEY_PATTERN =
  '(?:api_key|access_token|token|X-Emby-Token|X-MediaBrowser-Token)';

const QUERY_TOKEN_PATTERN = new RegExp(
  `([?&]${SENSITIVE_KEY_PATTERN}=)([^&#\\s]+)`,
  'giu'
);

const FREEFORM_TOKEN_PATTERN = new RegExp(
  `(\\b${SENSITIVE_KEY_PATTERN}\\b\\s*[:=]\\s*)([^\\s&]+)`,
  'giu'
);

export function redactSensitiveValue(value: string): string {
  return value
    .replace(QUERY_TOKEN_PATTERN, '$1[redacted]')
    .replace(FREEFORM_TOKEN_PATTERN, '$1[redacted]');
}

export function redactErrorMessage(error: unknown): string {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : String(error || 'network request failed');

  return redactSensitiveValue(message);
}
