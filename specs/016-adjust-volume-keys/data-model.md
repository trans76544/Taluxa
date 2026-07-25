# Data Model: Player Arrow-Key Volume Control

This feature introduces no persistent entities. It changes a small runtime interaction contract owned by mpv.

## Runtime Volume State

| Field | Type | Rules |
|-------|------|-------|
| `value` | number | Inclusive range 0–100 |
| `maximum` | number | Fixed at 100 for each Taluxa mpv session |
| `minimum` | number | mpv volume minimum, effectively 0 for this feature |

## Keyboard Volume Command

| Field | Type | Rules |
|-------|------|-------|
| `key` | `UP` or `DOWN` | Accepted by the active mpv player window |
| `delta` | `10` or `-10` | `UP` maps to `10`; `DOWN` maps to `-10` |
| `repeatable` | boolean | True; every accepted repeat event applies one transition |

## State Transitions

| Current state | Event | Result |
|---------------|-------|--------|
| 0–89 | `UP` | Current value + 10 |
| 90–100 | `UP` | Minimum of current value + 10 and 100 |
| 11–100 | `DOWN` | Current value - 10 |
| 0–10 | `DOWN` | Maximum of current value - 10 and 0 |
| 0 | `UP` | 10 |
| 100 | `DOWN` | 90 |

For non-multiple values, the transition remains relative: 95 + 10 clamps to 100, while 95 - 10 becomes 85.

## Runtime Pointer Interaction State

| Field | Type | Rules |
|-------|------|-------|
| `volume_dragging` | boolean | True from a volume-track left-button down until the corresponding release |
| `volume_track_left` | number | Current visible track start in normalized OSD coordinates |
| `volume_track_right` | number | Current visible track end in normalized OSD coordinates |
| `volume_knob_hovered` | derived boolean | True only when the pointer is within the knob hover bounds |
| `window_drag_region` | derived region | Top 54px excluding registered buttons |

## Scope and Relationships

- The keyboard command acts on the runtime volume state of the active mpv session.
- Mouse click and drag commands update the same runtime volume property.
- The generated input configuration belongs to one playback session and is supplied to that session at launch.
- The React renderer and persisted `defaultVolume` setting are not changed.
- The native mpv playback window contains no editable text field, so the feature cannot intercept text-editing cursor behavior. Non-player application views do not load this input configuration.
