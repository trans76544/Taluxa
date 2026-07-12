import type { PlayerStoryMarkerUpdate, StoryTimelineMarker } from '@shared/models/storyLandmark';

export interface BeginStoryMarkerDeliveryInput {
  accountId: string;
  itemId: string;
  load: () => Promise<StoryTimelineMarker[]>;
  serverUrl: string;
}

interface DeliveryRecord extends BeginStoryMarkerDeliveryInput {
  accepted: boolean;
  delivered: boolean;
  markers?: StoryTimelineMarker[];
  requestId: number;
}

export class StoryMarkerDeliveryCoordinator {
  private current: DeliveryRecord | null = null;
  private nextRequestId = 1;

  constructor(private readonly send: (update: PlayerStoryMarkerUpdate) => Promise<void> | void) {}

  begin(input: BeginStoryMarkerDeliveryInput): number {
    const requestId = this.nextRequestId++;
    const record: DeliveryRecord = { ...input, requestId, accepted: false, delivered: false };
    this.current = record;
    Promise.resolve().then(input.load).then(
      (markers) => this.resolve(requestId, markers),
      () => this.resolve(requestId, [])
    );
    return requestId;
  }

  accept(requestId: number): void {
    if (this.current?.requestId !== requestId) return;
    this.current.accepted = true;
    this.flush();
  }

  cancel(requestId?: number): void {
    if (this.current && (requestId === undefined || this.current.requestId === requestId)) this.current = null;
  }

  private resolve(requestId: number, markers: StoryTimelineMarker[]): void {
    if (this.current?.requestId !== requestId) return;
    this.current.markers = markers;
    this.flush();
  }

  private flush(): void {
    const record = this.current;
    if (!record || !record.accepted || record.markers === undefined || record.delivered) return;
    record.delivered = true;
    try { Promise.resolve(this.send({ itemId: record.itemId, markers: record.markers })).catch(() => undefined); } catch { /* contained at the delivery boundary */ }
  }
}
