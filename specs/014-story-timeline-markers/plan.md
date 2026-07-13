# Playback Story Timeline Markers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fetch Emby chapter, intro, and credits points without delaying playback and render them as merged, hoverable, click-to-seek markers on Taluxa's custom mpv timeline.

**Architecture:** A shared Emby module converts official `ChapterInfo[]` data into one validated, merged timeline-marker model. A renderer coordinator starts the request alongside playback preparation but releases a result only after the matching launch or episode switch is accepted; a typed, item-scoped IPC command then updates the existing mpv Lua overlay, which owns drawing, hover, clicking, resize behavior, and stale-item rejection.

**Tech Stack:** TypeScript 5.6, React 18, Electron 32 IPC/preload bridge, existing Emby HTTP client, external mpv JSON IPC and generated Lua/ASS overlay, Vitest, Testing Library, jsdom.

---

**Branch**: `014-story-timeline-markers` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/014-story-timeline-markers/spec.md`

**Note**: This plan completes `/speckit-plan` Phase 0 and Phase 1 design and provides the Phase 2 implementation sequence. `/speckit-tasks` may later convert it into a dependency-ordered `tasks.md`.

## Summary

Add a transient story-marker pipeline that reads `Chapters` from the active Emby item, prefers chapters belonging to the selected media source, maps `Chapter`, `IntroStart`, and `CreditsStart`, filters invalid points, and merges points within one second. Landmark I/O runs independently of source selection and preflight. The renderer gates early results until mpv accepts the item, main and Lua validate item ownership, and the custom progress bar draws uniform thin lines with immediate hover labels and click-to-seek while preserving normal seeking and playback progress synchronization.

## Technical Context

**Language/Version**: TypeScript 5.6 for Electron/React/shared code; generated Lua for the mpv overlay.

**Primary Dependencies**: React 18, Electron 32, existing `createEmbyRequest`, existing React Router item-detail flow, mpv JSON IPC, mpv `mp` and `mp.utils` Lua modules, existing ASS overlay helpers. No new runtime dependency is required.

**Storage**: N/A. Marker data is transient per active item and is neither cached nor persisted.

**Testing**: Vitest unit tests for model guards, source selection, normalization, merging, delivery races, controller command routing, and generated Lua; Testing Library integration tests in `App.test.tsx`; startup regression tests in `router.playback-performance.test.tsx`; full `npm test` and `npm run build`; manual Emby/mpv verification.

**Target Platform**: Windows desktop application using the bundled external mpv process.

**Project Type**: Electron desktop application with a React renderer, Electron main process, preload bridge, shared TypeScript modules, external Emby server, and generated mpv Lua UI.

**Performance Goals**: Do not add landmark network time to playback launch or episode switching; display markers within 2 seconds after both controls and landmark data are available; update hover labels within 250 ms; seek to a selected point within 1 second.

**Constraints**: Preserve DirectPlay and PlaybackInfo fallback startup behavior; preserve account/server isolation; never send credentials in marker payloads; clear outgoing markers during item switch; reject late results at renderer, main/controller, and Lua boundaries; keep ordinary seek, progress reporting, pause, volume, audio, subtitles, danmaku, and episode controls unchanged.

**Scale/Scope**: Existing Windows movie and episode playback; one active mpv session; chapter arrays sized for normal Emby video libraries, including dense timelines; chapter editing, persistence, automatic skipping, ranges, and skip buttons are excluded.

## Constitution Check

*GATE: Evaluated before Phase 0 and re-checked after Phase 1.*

The repository constitution is still the unfilled Spec Kit template and defines no enforceable principles or gates. The plan therefore applies established repository practices and the approved feature constraints:

- **PASS — Test-first delivery**: Every implementation task starts with a failing focused test and includes a red/green command.
- **PASS — Non-blocking playback**: Landmark retrieval is not added to stream-source or preflight awaits.
- **PASS — Security and account isolation**: Tokens remain inside the existing authenticated request; marker models and IPC contain no server URL, user id, or token.
- **PASS — Stale-state defense**: Request id, controller active/pending item, and Lua active item all guard updates.
- **PASS — Minimal scope**: No persistence, new dependency, server write, automatic skipping, range UI, or unrelated refactor is introduced.
- **PASS — Post-design re-check**: The data model, contracts, and task sequence preserve all gates above; no complexity exception is needed.

## Project Structure

### Documentation (this feature)

```text
specs/014-story-timeline-markers/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── story-timeline-markers.md
├── checklists/
│   └── requirements.md
└── tasks.md                         # Created later by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── shared/
│   ├── models/
│   │   ├── storyLandmark.ts         # Shared marker/update DTOs and runtime guard
│   │   └── storyLandmark.test.ts
│   └── api/emby/
│       ├── storyLandmarks.ts        # Emby Chapters fetch, source choice, normalize/merge
│       └── storyLandmarks.test.ts
├── renderer/
│   ├── features/player/
│   │   ├── storyMarkerDelivery.ts   # Result-ready + player-accepted coordination
│   │   └── storyMarkerDelivery.test.ts
│   ├── app/
│   │   ├── router.tsx               # Start/cancel/accept delivery for play and switch
│   │   ├── router.playback-performance.test.tsx
│   │   └── App.test.tsx
│   └── global.d.ts                  # Window bridge type
└── electron/
    ├── preload/index.ts             # setStoryMarkers bridge method
    └── main/
        ├── index.ts                 # Validating IPC handler
        └── player/
            ├── mpvController.ts     # Item-scoped command + Lua marker UI
            └── mpvController.test.ts
```

**Structure Decision**: Keep server-data normalization in shared code, transient readiness coordination beside other player renderer code, and visible interaction inside the existing mpv controller because the React player page is hidden and mpv owns the window. Do not add landmark concerns to persistent playback synchronization.

## Complexity Tracking

No constitution violations or complexity exceptions are required.

## Phase 0: Research Output

Research decisions are recorded in [research.md](./research.md). All technical unknowns are resolved:

- Official Emby source and marker types.
- Selected-media-source preference and fallback rules.
- Tick conversion, invalid-data behavior, one-second merge semantics, and labels.
- Non-blocking renderer readiness coordination.
- Typed IPC and multi-layer stale-item defense.
- Custom mpv overlay drawing, hover, click, resize, and switch clearing.

## Phase 1: Design Output

- Entity definitions and transitions: [data-model.md](./data-model.md)
- Emby, renderer, IPC, controller, and Lua contracts: [contracts/story-timeline-markers.md](./contracts/story-timeline-markers.md)
- Automated and manual verification: [quickstart.md](./quickstart.md)
- Agent context: `AGENTS.md` points to this plan.

## Phase 2: Implementation Tasks

### Task 1: Define and Validate the Shared Marker Model

**Files:**

- Create: `src/shared/models/storyLandmark.ts`
- Create: `src/shared/models/storyLandmark.test.ts`

- [ ] **Step 1: Write failing DTO and runtime-validation tests**

Cover a valid merged update, empty marker clear, blank item id, non-finite/negative time, unknown kind, duplicate/blank names, and malformed arrays.

```ts
import { describe, expect, it } from 'vitest';
import { isPlayerStoryMarkerUpdate } from './storyLandmark';

describe('isPlayerStoryMarkerUpdate', () => {
  it('accepts an item-scoped merged marker snapshot', () => {
    expect(isPlayerStoryMarkerUpdate({
      itemId: 'episode-1',
      markers: [{ startSeconds: 12, names: ['片头'], kinds: ['intro'] }],
    })).toBe(true);
  });

  it.each([
    { itemId: '', markers: [] },
    { itemId: 'episode-1', markers: [{ startSeconds: -1, names: [], kinds: ['chapter'] }] },
    { itemId: 'episode-1', markers: [{ startSeconds: Number.NaN, names: [], kinds: ['chapter'] }] },
    { itemId: 'episode-1', markers: [{ startSeconds: 1, names: [''], kinds: ['chapter'] }] },
    { itemId: 'episode-1', markers: [{ startSeconds: 1, names: [], kinds: ['unknown'] }] },
  ])('rejects malformed payload %#', (payload) => {
    expect(isPlayerStoryMarkerUpdate(payload)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the model test and verify red**

Run: `npm test -- src/shared/models/storyLandmark.test.ts`

Expected: FAIL because `storyLandmark.ts` does not exist.

- [ ] **Step 3: Add the shared DTOs and strict guard**

```ts
export const STORY_LANDMARK_KINDS = ['chapter', 'intro', 'credits'] as const;
export type StoryLandmarkKind = typeof STORY_LANDMARK_KINDS[number];

export interface StoryTimelineMarker {
  kinds: StoryLandmarkKind[];
  names: string[];
  startSeconds: number;
}

export interface PlayerStoryMarkerUpdate {
  itemId: string;
  markers: StoryTimelineMarker[];
}

export function isPlayerStoryMarkerUpdate(value: unknown): value is PlayerStoryMarkerUpdate {
  if (!value || typeof value !== 'object') return false;
  const update = value as Partial<PlayerStoryMarkerUpdate>;
  if (typeof update.itemId !== 'string' || !update.itemId.trim() || !Array.isArray(update.markers)) return false;
  return update.markers.every((marker) =>
    Boolean(marker) &&
    typeof marker === 'object' &&
    typeof marker.startSeconds === 'number' &&
    Number.isFinite(marker.startSeconds) &&
    marker.startSeconds >= 0 &&
    Array.isArray(marker.names) &&
    marker.names.every((name) => typeof name === 'string' && name.trim().length > 0) &&
    new Set(marker.names).size === marker.names.length &&
    Array.isArray(marker.kinds) &&
    marker.kinds.length > 0 &&
    marker.kinds.every((kind) => STORY_LANDMARK_KINDS.includes(kind)) &&
    new Set(marker.kinds).size === marker.kinds.length
  );
}
```

- [ ] **Step 4: Run the model test and verify green**

Run: `npm test -- src/shared/models/storyLandmark.test.ts`

Expected: PASS with all valid/invalid payload cases covered.

- [ ] **Step 5: Commit the shared model**

```powershell
git add src/shared/models/storyLandmark.ts src/shared/models/storyLandmark.test.ts
git commit -m "feat: define story timeline marker model"
```

### Task 2: Fetch, Normalize, and Merge Emby Chapters

**Files:**

- Create: `src/shared/api/emby/storyLandmarks.ts`
- Create: `src/shared/api/emby/storyLandmarks.test.ts`

- [ ] **Step 1: Write failing Emby contract and normalization tests**

Cover the authenticated URL, item-level chapters, selected-source priority, one-source fallback, ambiguous multi-source fallback, missing marker type, `IntroStart`, ignored `IntroEnd`, `CreditsStart`, unknown types, ticks conversion, duration bounds, stable sorting, one-second merging, no transitive over-merge, name fallback, and de-duplication.

```ts
it('maps and merges official chapter marker types', async () => {
  fetchMock.mockResolvedValue(jsonResponse({
    Chapters: [
      { StartPositionTicks: 100_000_000, MarkerType: 'Chapter', Name: 'Opening' },
      { StartPositionTicks: 105_000_000, MarkerType: 'IntroStart', Name: '' },
      { StartPositionTicks: 200_000_000, MarkerType: 'IntroEnd', Name: 'ignored' },
      { StartPositionTicks: 300_000_000, MarkerType: 'CreditsStart', Name: null },
    ],
  }));

  await expect(fetchStoryTimelineMarkers(createInput({ durationSeconds: 60 }), fetchMock))
    .resolves.toEqual([
      { startSeconds: 10, names: ['Opening', '片头'], kinds: ['chapter', 'intro'] },
      { startSeconds: 30, names: ['片尾'], kinds: ['credits'] },
    ]);
});

it('prefers chapters for the selected media source', async () => {
  fetchMock.mockResolvedValue(jsonResponse({
    Chapters: [{ StartPositionTicks: 10_000_000, Name: 'Item chapter' }],
    MediaSources: [{
      Id: 'source-2',
      Chapters: [{ StartPositionTicks: 20_000_000, Name: 'Version chapter' }],
    }],
  }));

  const result = await fetchStoryTimelineMarkers(
    createInput({ mediaSourceId: 'source-2' }),
    fetchMock
  );
  expect(result[0]).toEqual(expect.objectContaining({ startSeconds: 2, names: ['Version chapter'] }));
});
```

- [ ] **Step 2: Run the API test and verify red**

Run: `npm test -- src/shared/api/emby/storyLandmarks.test.ts`

Expected: FAIL because the Emby landmark module does not exist.

- [ ] **Step 3: Implement source selection and pure normalization**

Export the exact surface below. Keep raw Emby payload types private.

```ts
export interface FetchStoryTimelineMarkersInput {
  accessToken: string;
  durationSeconds?: number | null;
  itemId: string;
  mediaSourceId?: string | null;
  serverUrl: string;
  userId: string;
}

export function normalizeEmbyStoryTimelineMarkers(
  chapters: EmbyChapterInfo[] | null | undefined,
  durationSeconds?: number | null
): StoryTimelineMarker[];

export async function fetchStoryTimelineMarkers(
  input: FetchStoryTimelineMarkersInput,
  fetcher?: EmbyFetch
): Promise<StoryTimelineMarker[]>;
```

Build the request with the existing wrapper:

```ts
const fields = new URLSearchParams({ Fields: 'Chapters,MediaSources' });
const response = await createEmbyRequest(
  input.serverUrl,
  `/Users/${encodeURIComponent(input.userId)}/Items/${encodeURIComponent(input.itemId)}?${fields}`,
  { accessToken: input.accessToken, fetcher, operation: 'library' }
);
if (!response.ok) throw new Error(`Failed to load Emby story landmarks (${response.status})`);
```

Use `StartPositionTicks / 10_000_000`; treat missing type as chapter; ignore `IntroEnd` and unknown explicit types; trim names; assign `片头`/`片尾`; sort; and merge relative to the group's earliest point.

- [ ] **Step 4: Run shared landmark tests and verify green**

Run: `npm test -- src/shared/models/storyLandmark.test.ts src/shared/api/emby/storyLandmarks.test.ts`

Expected: PASS, including source-specific and malformed-payload coverage.

- [ ] **Step 5: Commit the Emby landmark pipeline**

```powershell
git add src/shared/api/emby/storyLandmarks.ts src/shared/api/emby/storyLandmarks.test.ts
git commit -m "feat: load Emby story landmarks"
```

### Task 3: Coordinate Non-Blocking Marker Delivery

**Files:**

- Create: `src/renderer/features/player/storyMarkerDelivery.ts`
- Create: `src/renderer/features/player/storyMarkerDelivery.test.ts`

- [ ] **Step 1: Write failing readiness and race tests**

Cover result-before-accept, accept-before-result, failure-to-empty, superseded result, cancel, exactly-once delivery, and rejected send containment.

```ts
it('holds an early result until the matching player action is accepted', async () => {
  const send = vi.fn().mockResolvedValue(undefined);
  const result = deferred<StoryTimelineMarker[]>();
  const coordinator = new StoryMarkerDeliveryCoordinator(send);
  const requestId = coordinator.begin({
    accountId: 'account-1', serverUrl: 'https://emby.test', itemId: 'episode-1',
    load: () => result.promise,
  });

  result.resolve([{ startSeconds: 12, names: ['片头'], kinds: ['intro'] }]);
  await Promise.resolve();
  expect(send).not.toHaveBeenCalled();

  coordinator.accept(requestId);
  await vi.waitFor(() => expect(send).toHaveBeenCalledWith({
    itemId: 'episode-1',
    markers: [{ startSeconds: 12, names: ['片头'], kinds: ['intro'] }],
  }));
});

it('discards a result superseded by another item', async () => {
  const first = deferred<StoryTimelineMarker[]>();
  const send = vi.fn();
  const coordinator = new StoryMarkerDeliveryCoordinator(send);
  const oldId = coordinator.begin(createRequest('episode-1', () => first.promise));
  coordinator.accept(oldId);
  const currentId = coordinator.begin(createRequest('episode-2', async () => []));
  coordinator.accept(currentId);
  first.resolve([{ startSeconds: 4, names: ['Old'], kinds: ['chapter'] }]);
  await Promise.resolve();
  expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ itemId: 'episode-1' }));
});
```

- [ ] **Step 2: Run the coordinator test and verify red**

Run: `npm test -- src/renderer/features/player/storyMarkerDelivery.test.ts`

Expected: FAIL because the coordinator does not exist.

- [ ] **Step 3: Implement a dependency-injected coordinator**

```ts
export interface BeginStoryMarkerDeliveryInput {
  accountId: string;
  itemId: string;
  load: () => Promise<StoryTimelineMarker[]>;
  serverUrl: string;
}

export class StoryMarkerDeliveryCoordinator {
  constructor(
    private readonly send: (update: PlayerStoryMarkerUpdate) => Promise<void> | void
  ) {}

  begin(input: BeginStoryMarkerDeliveryInput): number;
  accept(requestId: number): void;
  cancel(requestId?: number): void;
}
```

Maintain one current record `{ requestId, itemId, accountId, serverUrl, accepted, markers, delivered }`. `begin` replaces the record and invokes `load` immediately. Resolve failures to `[]`. A private `flush` delivers only the current, accepted, resolved, undelivered record and catches both synchronous and asynchronous send failures.

- [ ] **Step 4: Run the coordinator test and verify green**

Run: `npm test -- src/renderer/features/player/storyMarkerDelivery.test.ts`

Expected: PASS with no unhandled rejection.

- [ ] **Step 5: Commit the delivery coordinator**

```powershell
git add src/renderer/features/player/storyMarkerDelivery.ts src/renderer/features/player/storyMarkerDelivery.test.ts
git commit -m "feat: coordinate story marker delivery"
```

### Task 4: Add the Typed Item-Scoped Player Command

**Files:**

- Modify: `src/electron/preload/index.ts`
- Modify: `src/renderer/global.d.ts`
- Modify: `src/electron/main/index.ts`
- Modify: `src/electron/main/player/mpvController.ts`
- Modify: `src/electron/main/player/mpvController.test.ts`

- [ ] **Step 1: Write failing controller command tests**

Add tests proving a valid active-item snapshot becomes one JSON script-message argument, a pending replacement is accepted, another item is ignored, an empty array clears, and names containing quotes, separators, braces, and Unicode survive JSON serialization.

```ts
controller.setStoryMarkers({
  itemId: 'episode-1',
  markers: [{ startSeconds: 12, names: ['A | "B" {C}'], kinds: ['chapter'] }],
});

expect(ipcClient.write).toHaveBeenCalledWith(
  `${JSON.stringify({ command: [
    'script-message',
    'taluxa-story-markers',
    'episode-1',
    JSON.stringify([{ startSeconds: 12, names: ['A | "B" {C}'], kinds: ['chapter'] }]),
  ] })}\n`
);
```

- [ ] **Step 2: Run the controller test and verify red**

Run: `npm test -- src/electron/main/player/mpvController.test.ts`

Expected: FAIL because `setStoryMarkers` and its command do not exist.

- [ ] **Step 3: Add the preload/global bridge method**

Import `PlayerStoryMarkerUpdate` into preload and expose:

```ts
setStoryMarkers: (input: PlayerStoryMarkerUpdate) =>
  ipcRenderer.invoke('player:set-story-markers', input) as Promise<void>,
```

Add the same method to `Window['embyDesktop']['player']` in `src/renderer/global.d.ts`.

- [ ] **Step 4: Validate in main and forward to the controller**

```ts
ipcMain.handle('player:set-story-markers', (_event, input: unknown) => {
  if (!isPlayerStoryMarkerUpdate(input)) {
    throw new Error('Invalid story marker update.');
  }
  mpvController.setStoryMarkers(input);
});
```

Do not log the payload. Add `MpvController.setStoryMarkers` with this guard before queueing:

```ts
const session = this.activeSession;
const pendingItemId = session?.pendingReplacement?.input.itemId;
if (!session || (session.itemId !== update.itemId && pendingItemId !== update.itemId)) return;
this.queueSessionCommand(session.sessionId, [
  'script-message', 'taluxa-story-markers', update.itemId, JSON.stringify(update.markers),
]);
```

- [ ] **Step 5: Run model and controller tests and verify green**

Run: `npm test -- src/shared/models/storyLandmark.test.ts src/electron/main/player/mpvController.test.ts`

Expected: PASS, including active, pending, stale, clear, and JSON integrity cases.

- [ ] **Step 6: Run the TypeScript build gate**

Run: `npm run build`

Expected: TypeScript and Vite succeed with the updated bridge type.

- [ ] **Step 7: Commit the player command**

```powershell
git add src/electron/preload/index.ts src/renderer/global.d.ts src/electron/main/index.ts src/electron/main/player/mpvController.ts src/electron/main/player/mpvController.test.ts
git commit -m "feat: send item-scoped story markers to mpv"
```

### Task 5: Render and Interact With Markers in the mpv Timeline

**Files:**

- Modify: `src/electron/main/player/mpvController.ts`
- Modify: `src/electron/main/player/mpvController.test.ts`

- [ ] **Step 1: Write failing generated-Lua behavior tests**

Assert the generated script contains:

- `local utils = require 'mp.utils'`.
- Initial `active_item_id` and empty `story_markers`.
- JSON parsing and item-id guard for `taluxa-story-markers`.
- `taluxa-active-episode` assigning the new id before clearing markers.
- Marker x calculation from `start_seconds / duration` and current `bar_width`.
- Thin vertical drawing and a wider hit area registered before `seek`.
- Hover-name drawing above the marker.
- Marker click setting `time-pos` to `button.value` before ordinary seek.
- A `MOUSE_MOVE` binding that redraws immediately.

```ts
expect(uiScript).toContain("local utils = require 'mp.utils'");
expect(uiScript).toContain("mp.register_script_message('taluxa-story-markers'");
expect(uiScript).toContain("if tostring(item_id or '') ~= active_item_id then return end");
expect(uiScript.indexOf("add_range_button('story-marker'"))
  .toBeLessThan(uiScript.indexOf("add_range_button('seek'"));
expect(uiScript).toContain("mp.commandv('set', 'time-pos', tostring(button.value))");
expect(uiScript).toContain("mp.add_forced_key_binding('MOUSE_MOVE'");
```

- [ ] **Step 2: Run the mpv controller test and verify red**

Run: `npm test -- src/electron/main/player/mpvController.test.ts`

Expected: FAIL on missing story-marker Lua behavior.

- [ ] **Step 3: Extend generated Lua state and dynamic update parsing**

Initialize:

```lua
local utils = require 'mp.utils'
local active_item_id = <escaped launch item id>
local story_markers = {}
```

Register:

```lua
mp.register_script_message('taluxa-story-markers', function(item_id, markers_json)
  if tostring(item_id or '') ~= active_item_id then return end
  local parsed = utils.parse_json(tostring(markers_json or ''))
  story_markers = type(parsed) == 'table' and parsed or {}
  draw_controls()
end)
```

Change `taluxa-active-episode` to set `active_item_id`, clear `story_markers`, reset position/duration, and redraw. Ensure item id and all names use existing Lua/ASS escaping rules.

- [ ] **Step 4: Draw markers and hover labels from current geometry**

Add a focused helper called by `draw_controls` after cache/progress drawing and before the `seek` hit target. For each finite in-range marker:

```lua
local marker_x = bar_left + math.floor(bar_width * clamp(start_seconds / duration, 0, 1))
append_box(out, marker_x - 1, bar_y - 7, marker_x + 1, bar_y + 7, 'FFFFFF', 0)
add_range_button('story-marker', marker_x - 7, bar_y - 14, marker_x + 7, bar_y + 14, start_seconds)
```

Use normalized mouse position to pick the closest hit marker and render `table.concat(marker.names, ' · ')` above the marker. Clamp the tooltip anchor between the timeline ends.

- [ ] **Step 5: Make marker clicks precede ordinary seek and refresh hover immediately**

Extend `add_range_button` to retain `value`. Add the marker click branch before `id == 'seek'`:

```lua
if id == 'story-marker' and duration > 0 and button.value then
  mp.commandv('set', 'time-pos', tostring(clamp(tonumber(button.value) or 0, 0, duration)))
elseif id == 'seek' and duration > 0 then
  -- existing proportional seek unchanged
end
```

Add:

```lua
mp.add_forced_key_binding('MOUSE_MOVE', 'taluxa-mouse-move', function()
  mark_controls_active()
  draw_controls()
end)
```

- [ ] **Step 6: Verify marker and existing-control tests green**

Run: `npm test -- src/electron/main/player/mpvController.test.ts`

Expected: PASS for story markers and all existing seek, pause, volume, resize, episode, subtitle, danmaku, and progress tests.

- [ ] **Step 7: Commit the mpv interaction**

```powershell
git add src/electron/main/player/mpvController.ts src/electron/main/player/mpvController.test.ts
git commit -m "feat: render interactive story markers in mpv"
```

### Task 6: Integrate Landmark Loading With Initial Play and Episode Switch

**Files:**

- Modify: `src/renderer/app/router.tsx`
- Modify: `src/renderer/app/router.playback-performance.test.tsx`
- Modify: `src/renderer/app/App.test.tsx`

- [ ] **Step 1: Add failing route integration tests**

Cover movie launch, early result held until launch-ready, delayed result after launch-ready, request failure delivering `[]`, episode switch acceptance, switch clearing, rapid A→B switch with late A result, failed launch cancellation, account change cancellation, and selected media source forwarding.

```ts
it('does not wait for story landmarks before launching direct play', async () => {
  const landmarks = deferred<Response>();
  fetchMock.mockImplementation((url) =>
    String(url).includes('Fields=Chapters') ? landmarks.promise : normalPlaybackResponse(url)
  );

  fireEvent.click(await screen.findByRole('button', { name: /play/i }));
  await waitFor(() => expect(playerLaunchMock).toHaveBeenCalledTimes(1));
  expect(landmarks.settled).toBe(false);
});

it('ignores the earlier episode landmark result after a rapid switch', async () => {
  const first = deferred<Response>();
  const second = deferred<Response>();
  // select episode A, then B; accept B; resolve A last
  second.resolve(chapterResponse('B chapter'));
  first.resolve(chapterResponse('A chapter'));

  await waitFor(() => expect(setStoryMarkersMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ itemId: 'episode-b' })
  ));
  expect(setStoryMarkersMock).not.toHaveBeenCalledWith(
    expect.objectContaining({ itemId: 'episode-a' })
  );
});
```

- [ ] **Step 2: Run route tests and verify red**

Run: `npm test -- src/renderer/app/router.playback-performance.test.tsx src/renderer/app/App.test.tsx`

Expected: FAIL because the route does not load or deliver story markers and bridge mocks lack `setStoryMarkers`.

- [ ] **Step 3: Create one coordinator for the mounted item-detail route**

Initialize it once with a ref:

```ts
const storyMarkerDeliveryRef = useRef<StoryMarkerDeliveryCoordinator | null>(null);
storyMarkerDeliveryRef.current ??= new StoryMarkerDeliveryCoordinator((update) =>
  window.embyDesktop.player.setStoryMarkers(update)
);
```

Cancel on route unmount and when the active account/server identity changes. Add an `episodeSwitchGenerationRef` using the existing request-generation guard pattern so rapid source/preflight results cannot commit an older switch.

- [ ] **Step 4: Start landmark I/O without adding it to launch awaits**

At each initial play intent, create the existing `sourcePromise`, then call `begin` without awaiting landmark delivery and keep the returned request id in `currentPlaybackLaunchRef`. Let the landmark loader await the already-running source promise internally so it can use the exact selected `mediaSourceId`; this wait is isolated from the launch path:

```ts
const storyMarkerRequestId = storyMarkerDelivery.begin({
  accountId: resolvedActiveAccountId,
  serverUrl,
  itemId: playItemId,
  load: async () => {
    const source = await sourcePromise;
    const runtimeTicks = details?.id === playItemId
      ? details.runtimeTicks
      : episodes.find((episode) => episode.id === playItemId)?.runtimeTicks;
    return fetchStoryTimelineMarkers({
      serverUrl, userId: session.userId, accessToken: session.accessToken,
      itemId: playItemId, mediaSourceId: source.mediaSourceId,
      durationSeconds: getRuntimeSeconds(runtimeTicks) || null,
    });
  },
});
```

Do not insert this promise into `Promise.all`, `waitForFastPlaybackPreflight`, or the state required to render `PlayerPage`.

- [ ] **Step 5: Accept or cancel initial delivery from existing launch callbacks**

Extend `CurrentPlaybackLaunch` with `storyMarkerRequestId`. In `handlePlaybackLaunchReady`, after the existing launch id guard, call `accept`. In `handlePlaybackLaunchFailure`, call `cancel` before clearing the current launch. Cancel the request in every source/preflight failure branch.

- [ ] **Step 6: Add token-safe episode-switch delivery**

Begin the marker request when episode selection starts. Its `load` closure awaits the same already-running next-source promise to obtain `mediaSourceId`, while the switch path independently awaits source selection and preflight; the marker result is never in that switch await chain. After every switch-path await, reject a stale episode-switch generation. Only after `await player.switchEpisode(...)` succeeds call `storyMarkerDelivery.accept(requestId)`, then update the route's playback item state. On failure or supersession call `cancel(requestId)`.

Pass the selected media source id and episode runtime to the landmark request. The controller's extended `taluxa-active-episode` handler performs the actual immediate marker clear.

- [ ] **Step 7: Verify focused route tests green**

Run: `npm test -- src/renderer/features/player/storyMarkerDelivery.test.ts src/renderer/app/router.playback-performance.test.tsx src/renderer/app/App.test.tsx`

Expected: PASS. Deferred landmark requests do not delay launch or switch, and stale/account-crossing results are never delivered.

- [ ] **Step 8: Commit the route integration**

```powershell
git add src/renderer/app/router.tsx src/renderer/app/router.playback-performance.test.tsx src/renderer/app/App.test.tsx
git commit -m "feat: load story markers without delaying playback"
```

### Task 7: Verify End-to-End Behavior and Regressions

**Files:**

- Modify only if verification exposes a gap:
  - `src/shared/models/storyLandmark.test.ts`
  - `src/shared/api/emby/storyLandmarks.test.ts`
  - `src/renderer/features/player/storyMarkerDelivery.test.ts`
  - `src/electron/main/player/mpvController.test.ts`
  - `src/renderer/app/router.playback-performance.test.tsx`
  - `src/renderer/app/App.test.tsx`
- Follow: `specs/014-story-timeline-markers/quickstart.md`

- [ ] **Step 1: Run every focused suite together**

```powershell
npm test -- src/shared/models/storyLandmark.test.ts src/shared/api/emby/storyLandmarks.test.ts src/renderer/features/player/storyMarkerDelivery.test.ts src/electron/main/player/mpvController.test.ts src/renderer/app/router.playback-performance.test.tsx src/renderer/app/App.test.tsx
```

Expected: all selected suites pass with zero failed tests and no unhandled rejection.

- [ ] **Step 2: Run the complete test suite**

Run: `npm test`

Expected: exit code 0 and zero failed Vitest suites.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: TypeScript exits without errors and Vite completes renderer/Electron output.

- [ ] **Step 4: Inspect scope, formatting, and credential safety**

```powershell
git diff --check
git diff --name-only
rg -n "api_key=|X-Emby-Token.*token-|MediaBrowser Token=.*token-" src
```

Expected: `git diff --check` prints nothing; changed files match this plan; source contains no real credential or token-bearing marker payload. Existing placeholder tokens remain confined to tests.

- [ ] **Step 5: Perform the manual Emby/mpv checklist**

Follow every step in [quickstart.md](./quickstart.md). Record server version, item/source ids, returned/rendered counts, largest seek error, hover responsiveness, startup timing, switch behavior, and any compatibility deviation.

- [ ] **Step 6: Commit verification adjustments only when needed**

```powershell
git add src specs/014-story-timeline-markers AGENTS.md
git commit -m "test: verify playback story timeline markers"
```

Do not create an empty commit when verification requires no adjustment.

## Requirement Coverage

| Requirements | Covered by |
|---|---|
| FR-001, FR-003, FR-004, FR-007, FR-008, FR-009, FR-010, FR-018 | Tasks 1, 2, 6 |
| FR-002, FR-014, FR-015, FR-016, FR-017 | Tasks 3, 4, 6, 7 |
| FR-005, FR-006, FR-011, FR-012, FR-013 | Tasks 4, 5, 7 |
| FR-019 | Tasks 6, 7 |
| SC-001, SC-002 | Tasks 2, 3, 5, 6, 7 |
| SC-003, SC-004, SC-007 | Tasks 5, 7 and manual verification |
| SC-005, SC-006 | Tasks 3, 4, 5, 6, 7 |
| SC-008 | Tasks 5, 6, 7 |

## Implementation Handoff

Execute tasks in order. Task 1 establishes the IPC-safe model; Task 2 establishes deterministic Emby mapping; Task 3 resolves async readiness independently; Tasks 4 and 5 add the player boundary and visible interaction; Task 6 connects playback intent without adding latency; Task 7 proves the full story. Keep each red/green/commit checkpoint intact so regressions are attributable to one boundary.
