# UI Contract: Player Volume Control

## Scope

This contract applies while the Taluxa-launched mpv playback window receives keyboard or pointer input.

## Keyboard Bindings

| Input | Command | Required result |
|-------|---------|-----------------|
| `UP` | `add volume 10` | Increase current volume by 10, clamped at 100 |
| `DOWN` | `add volume -10` | Decrease current volume by 10, clamped at 0 |

## Boundary Contract

- Every Taluxa mpv session sets its maximum volume to 100.
- Values closer than 10 points to a boundary land exactly on that boundary.
- Input repeat remains enabled; each accepted repeat event applies one command.
- Keyboard changes suppress mpv's native volume OSD and update the custom bottom control.

## Mouse Interaction Contract

- Clicking the bottom track maps its visible horizontal bounds to 0–100.
- Holding and moving the left button continuously updates volume until release, including outside the track bounds.
- Hovering the knob or actively dragging shows the rounded current percentage using the progress-time font size.
- Automatic mpv window dragging is disabled so it cannot cancel a volume drag.
- The top 54px non-button region explicitly starts window movement.

## Compatibility Contract

- Existing F6–F10 custom bindings remain present and unchanged.
- Left/Right and all keys other than Up/Down retain their previous behavior.
- Existing mouse-wheel volume adjustment remains unchanged.
- Window buttons, center click, video double-click, adjacent controls, and renderer keyboard handling retain their established paths.
- Keyboard input outside the native player window is unaffected.

## Verification Contract

Automated tests must assert:

1. The generated input configuration contains each binding exactly once.
2. The mpv launch arguments include `--volume-max=100` and `--input-builtin-dragging=no`.
3. The generated Lua contains clamped click/drag mapping and hover/drag tooltip behavior.
4. Only the top non-button area invokes `begin-vo-dragging`.
5. Existing custom input bindings remain present.
6. Existing launch and custom-player test coverage continues to pass.
7. Manual acceptance covers the native Windows VO event sequence.
