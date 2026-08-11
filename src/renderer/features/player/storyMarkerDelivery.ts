import type { PlayerStoryMarkerUpdate, StoryTimelineMarker } from '@shared/models/storyLandmark';

export interface BeginStoryMarkerDeliveryInput {
  accountId: string;
  itemId: string;
  load: () => Promise<StoryTimelineMarker[]>;
  playerSessionId?: number;
  serverUrl: string;
}

interface DeliveryRecord extends BeginStoryMarkerDeliveryInput {
  accepted: boolean;
  delivered: boolean;
  markers?: StoryTimelineMarker[];
  requestId: number;
}

export class StoryMarkerDeliveryCoordinator {
  private readonly records = new Map<number, DeliveryRecord>();
  private nextRequestId = 1;

  constructor(private readonly send: (update: PlayerStoryMarkerUpdate) => Promise<void> | void) {}

  begin(input: BeginStoryMarkerDeliveryInput): number {
    if (input.playerSessionId !== undefined) {
      for (const [requestId, record] of this.records) {
        if (record.playerSessionId === input.playerSessionId) this.records.delete(requestId);
      }
    }
    const requestId = this.nextRequestId++;
    const record: DeliveryRecord = { ...input, requestId, accepted: false, delivered: false };
    this.records.set(requestId, record);
    Promise.resolve().then(input.load).then(
      (markers) => this.resolve(requestId, markers),
      () => this.resolve(requestId, [])
    );
    return requestId;
  }

  accept(requestId: number): void {
    const record = this.records.get(requestId);
    if (!record) return;
    record.accepted = true;
    this.flush(record);
  }

  bindSession(requestId: number, playerSessionId: number): void {
    const record = this.records.get(requestId);
    if (!record) return;
    record.playerSessionId = playerSessionId;
    this.flush(record);
  }

  cancel(requestId?: number): void {
    if (requestId === undefined) this.records.clear();
    else this.records.delete(requestId);
  }

  private resolve(requestId: number, markers: StoryTimelineMarker[]): void {
    const record = this.records.get(requestId);
    if (!record) return;
    record.markers = markers;
    this.flush(record);
  }

  private flush(record: DeliveryRecord): void {
    if (!record || !record.accepted || record.markers === undefined || record.playerSessionId === undefined || record.delivered) return;
    record.delivered = true;
    this.records.delete(record.requestId);
    try { Promise.resolve(this.send({ itemId: record.itemId, markers: record.markers, playerSessionId: record.playerSessionId })).catch(() => undefined); } catch { /* contained at the delivery boundary */ }
  }
}
