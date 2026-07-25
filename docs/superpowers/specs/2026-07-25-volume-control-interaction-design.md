# Volume Control Interaction Design

**Date:** 2026-07-25
**Status:** User-approved design
**Scope:** Native mpv input configuration and the existing Taluxa Lua control overlay

## Goal

Refine volume feedback and mouse interaction in the player:

- Up and Down continue to change volume by 10 within the 0–100 range.
- Keyboard volume changes show no native mpv volume bar and no top-left volume text.
- The bottom blue volume bar supports click-to-set and continuous dragging.
- Hovering the blue volume knob, or dragging the bar, shows the current integer percentage above the knob.
- The percentage tooltip uses the same font size as the timeline time labels.

## Selected Approach

Keep all behavior inside the existing mpv input configuration and Taluxa Lua control overlay.

The input configuration will make Up and Down volume changes with mpv OSD suppressed. The Lua overlay will remain the single source of truth for the visible volume bar, drag state, hit testing, and percentage tooltip. This avoids global OSD styling changes and avoids adding Electron renderer overlays or IPC.

## Keyboard Behavior

The generated input configuration will replace the current visible volume commands with OSD-suppressed commands:

- Up adds 10.
- Down subtracts 10.
- mpv's existing `--volume-max=100` launch argument remains unchanged.

No center-screen volume bar or top-left `Volume` text is shown. The bottom Taluxa volume bar updates through the existing observed `volume` property.

## Mouse Interaction

The complete volume track is interactive.

1. Pressing the left mouse button anywhere in the volume hit area immediately maps the horizontal pointer position to a volume from 0 through 100.
2. The press starts a volume-drag state.
3. While the button remains down, mouse movement continuously updates volume.
4. Pointer positions left or right of the track are clamped to 0 or 100.
5. Releasing the button applies the final position and ends the drag state.

Existing non-volume clicks retain their current behavior. Mouse wheel volume control and the mute button are unchanged.

## Tooltip

The tooltip is visible only when either condition is true:

- The pointer is within the blue knob's hover hit area.
- A volume drag is active.

The tooltip:

- Is centered horizontally above the current knob.
- Displays the rounded integer value in percentage form, such as `70%`.
- Uses font size `16`, matching the timeline time labels.
- Moves with the knob while dragging.
- Disappears when the pointer leaves the knob and no drag is active.

## Internal Structure

The Lua overlay will add:

- A boolean drag-state value.
- A helper that maps a pointer position and volume-track bounds to a clamped integer volume.
- A complex left-mouse binding that distinguishes press and release.
- Drag-aware mouse-move handling.
- Knob hover detection and tooltip drawing in `draw_controls`.

The existing observed `volume` property remains authoritative. The overlay does not maintain a separate persistent volume value.

## Edge Cases

- A missing mouse position cancels or safely ignores the attempted update without changing volume.
- Zero-width hit bounds use the existing minimum-width guard.
- Dragging outside the track remains active until release and clamps the value.
- Hidden controls cannot begin a new volume drag.
- Starting a drag marks controls active so they remain visible during interaction.
- Volume values reported by mpv are clamped before positioning the knob or formatting the tooltip.

## Verification

Tests will first be added and observed failing for the new contracts, then production behavior will be implemented.

Automated coverage will verify:

- Exact Up and Down bindings suppress OSD and retain increments of 10.
- The generated Lua script contains press, drag, release, and clamping behavior.
- Clicking the track updates volume immediately.
- Tooltip visibility depends on knob hover or active dragging.
- Tooltip text is an integer percentage and uses font size `16`.
- Existing progress seeking, menus, mouse wheel handling, mute behavior, and F6–F10 bindings remain intact.

Final verification will run the focused mpv controller tests, the full test suite, the TypeScript/Vite production build, and diff hygiene checks. Native-player manual verification will cover keyboard silence, click-to-set, continuous drag, endpoints, tooltip positioning, and regression checks for neighboring controls.
