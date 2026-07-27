# Playback Progress Bar Drag Design

**Date**: 2026-07-28

**Status**: Approved for planning

## Goal

Allow viewers to hold the left mouse button on the custom playback progress bar and drag to seek continuously. Releasing the button leaves playback at the final pointer position.

## Scope

This change applies only to the custom mpv playback progress bar. It preserves:

- Existing single-click seeking
- Five-second left/right keyboard seeking
- Volume dragging
- Story-marker click priority
- The current paused or playing state
- Existing custom controls and intentional OSD feedback

It does not add a seek preview thumbnail, tooltip, new setting, alternate mouse button, or modified-key behavior.

## Interaction Design

1. Pressing the left mouse button on the progress bar starts a seek drag.
2. Playback immediately seeks to the pressed position.
3. Moving the mouse while the button remains held continuously updates playback time.
4. Releasing the button performs one final seek and ends the drag.
5. Pointer positions left or right of the bar clamp to the media start or end.
6. The control overlay remains visible for the full drag.
7. If duration is unavailable or non-positive, a seek drag does not begin.
8. A canceled or missing release position still clears the drag state without applying an invalid final seek.

## Architecture

Extend the generated mpv UI script in `src/electron/main/player/mpvController.ts` using the same state-driven pattern as volume dragging:

- Add a dedicated `seek_dragging` flag.
- Retain the progress bar's current left and right bounds after layout.
- Add a helper that converts a normalized pointer X coordinate into a clamped media position.
- Start the drag from the complex `MBTN_LEFT` down event when the hit target is the seek bar.
- Update the seek position from the existing `MOUSE_MOVE` binding while dragging.
- Finalize and clear the state from the `MBTN_LEFT` up event.
- Treat seeking as active interaction so automatic control hiding remains suspended during the drag.

The progress and volume drag states remain separate because they target different properties and hit areas.

## Data Flow

```text
left-button down on seek bar
  -> set seek_dragging
  -> pointer X / bar width
  -> clamp ratio to 0..1
  -> duration * ratio
  -> set playback time

mouse move while dragging
  -> repeat clamped playback-time update

left-button up
  -> apply final valid pointer position
  -> clear seek_dragging
  -> redraw controls
```

## Error and Boundary Handling

- Missing pointer coordinates do not issue a playback command.
- Invalid or zero duration prevents drag start.
- A pointer outside the bar is clamped rather than ignored.
- Drag state is always cleared on button release, even when the event is canceled.
- Volume dragging retains its existing behavior and cannot be started by the seek hit target.

## Testing

Use test-driven development in `src/electron/main/player/mpvController.test.ts`:

1. Add failing generated-script assertions for seek drag state, bar bounds, pointer conversion, down/move/up behavior, visibility, clamping, and cleanup.
2. Run the focused controller test and confirm failure is caused by the absent drag behavior.
3. Implement the minimal script changes in `src/electron/main/player/mpvController.ts`.
4. Re-run the focused controller test.
5. Run the full Vitest suite and production build.
6. Manually verify press, continuous drag, release, out-of-range clamping, paused playback, volume dragging, story markers, and single-click seeking in a real playback session.

## Acceptance Criteria

- Dragging left or right across the progress bar continuously updates playback position.
- Releasing the left mouse button leaves playback at the final clamped position.
- Dragging beyond either end seeks to the media start or end.
- Controls remain visible throughout the drag.
- Paused playback remains paused.
- Single-click seeking, volume dragging, story markers, keyboard seeking, and other playback feedback continue to work.
