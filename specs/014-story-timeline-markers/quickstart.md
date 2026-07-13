# Quickstart: Playback Story Timeline Markers

## Prerequisites

- Windows development environment with the bundled mpv present.
- An Emby account that can play at least one movie and two episodes.
- Test media containing ordinary chapters and, if available, `IntroStart` and `CreditsStart` markers.
- A second media version or an item with no markers for fallback checks.

## Automated Verification

### Pre-feature baseline (2026-07-13)

- Command: `npm test -- src/shared/api/emby/library.test.ts src/electron/main/player/mpvController.test.ts src/renderer/app/router.playback-performance.test.tsx src/renderer/app/App.test.tsx`
- Result: 4 test files passed, 141 tests passed, 0 failed.
- Existing output: React Router v7 future-flag warnings are present in renderer suites; no functional baseline failure.

### Automated hover/click coverage (2026-07-13)

- `src/electron/main/player/mpvController.test.ts` covers 14 px marker hit targets registered before seek, closest-marker arbitration for dense overlaps, merged-name tooltip text and placement, immediate `MOUSE_MOVE` redraw, bounded marker seeking, and unchanged proportional seek behavior.
- Focused result after US2: 50 controller tests passed, 0 failed; `npm run build` passed.

### Final automated verification (2026-07-13)

- Focused feature gate: 6 test files, 178 tests passed, 0 failed.
- Full Vitest gate: 52 test files passed, 0 failed.
- Production build: TypeScript, renderer, Electron main, and preload builds passed.
- `git diff --check`: no whitespace errors.
- Changed source scope: shared marker model/API, delivery coordinator, preload/main IPC, mpv controller, playback route, fixtures, and their tests only.
- Credential scan: matches are existing test placeholders (`token-123`, `secret-token`), redaction tests, and the scan command itself; no real credential or marker payload containing credentials was found.
- Existing non-failing output: React Router v7 future-flag warnings remain unchanged.

Run focused suites:

```powershell
npm test -- src/shared/models/storyLandmark.test.ts src/shared/api/emby/storyLandmarks.test.ts src/renderer/features/player/storyMarkerDelivery.test.ts src/electron/main/player/mpvController.test.ts src/renderer/app/router.playback-performance.test.tsx src/renderer/app/App.test.tsx
```

Expected: all selected suites pass with zero failed tests.

Run full verification:

```powershell
npm test
npm run build
git diff --check
```

Expected: all tests pass, TypeScript and Vite build successfully, and `git diff --check` prints nothing.

## Manual Emby Verification

### Chapters and semantic markers

1. Start a movie with ordinary chapters, intro, and credits markers.
2. Open the playback controls.
3. Confirm all markers use the same thin vertical style.
4. Compare each marker position with Emby's chapter data.
5. Confirm `IntroEnd` does not create a second intro point.
6. Confirm unnamed intro and credits markers display `片头` and `片尾`.

### Hover and click

1. Move the pointer onto each marker.
2. Confirm its label appears above the exact marker without a visible one-second delay.
3. For a merged marker, confirm all distinct names appear once.
4. Click each marker and record the resulting playback position.
5. Confirm the difference from the marker time is no more than one second.
6. Click empty portions of the progress bar and confirm ordinary proportional seeking still works.

### Resize and density

1. Resize the mpv window while controls are visible.
2. Confirm markers remain aligned to their times.
3. Use media with dense chapters and confirm markers remain thin and the progress handle stays visible.
4. Move rapidly across adjacent markers and confirm the hover label follows the selected marker.

### Episode switching and stale results

1. Play an episode with markers.
2. Switch to an episode with a different marker set.
3. Confirm outgoing markers disappear as the active episode changes.
4. Switch rapidly between two episodes while network responses are delayed.
5. Confirm a late result from the earlier episode never appears on the current episode.
6. Switch to an item with no markers and confirm the timeline stays empty.

### Failure behavior

1. Block the Emby landmark request while leaving the media stream reachable.
2. Start playback and confirm it is not delayed or interrupted.
3. Confirm no error popup appears and no previous-item marker remains.
4. Restore connectivity, start the item again, and confirm its markers appear normally.
5. Change accounts while a delayed landmark request is in flight and confirm the old account's result is never delivered.

## Performance Check

Use existing startup timing output for DirectPlay and PlaybackInfo fallback cases.

- Landmark loading must not be awaited by source resolution, preflight, launch, or switch.
- The `player-launch-requested` and `playback-ready` milestones must remain within the existing regression thresholds.
- Once both controls and landmark data are available, markers should appear within two seconds.

## Security Check

```powershell
rg -n "api_key=|X-Emby-Token.*token-|MediaBrowser Token=.*token-" src specs/014-story-timeline-markers
```

Expected: no real credential is persisted, rendered, logged, or included in marker IPC payloads. Test fixtures may use placeholder tokens in test files only.

## Results to Record

- Emby server version.
- Test item ids and selected media source ids.
- Marker counts returned and rendered.
- Largest observed click-to-position difference.
- Marker appearance delay after data availability.
- Startup timing before and after the feature.
- Any server/version behavior that differs from the documented `ChapterInfo` contract.

### Manual result status

- Pending: a reachable Emby server with chapter/intro/credits test media was not supplied in this implementation environment.
- Required before release: complete every scenario above and replace this pending note with the server version, item/source ids, marker counts, click error, hover response, startup timing, and compatibility observations.
