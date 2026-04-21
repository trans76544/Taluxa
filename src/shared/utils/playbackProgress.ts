export interface ResumePositionInput {
  savedPositionSeconds: number | null;
  serverPositionTicks: number | null;
}

export function getResumePositionSeconds({
  savedPositionSeconds,
  serverPositionTicks,
}: ResumePositionInput): number {
  if (savedPositionSeconds !== null) {
    return savedPositionSeconds;
  }

  if (typeof serverPositionTicks === 'number' && Number.isFinite(serverPositionTicks)) {
    return Math.floor(serverPositionTicks / 10000000);
  }

  return 0;
}
