# Research: Player Arrow-Key Volume Control

## Decision 1: Own the shortcut in the generated mpv input configuration

**Decision**: Add `UP` and `DOWN` bindings to `createMpvInputConfig()`.

**Rationale**: The visible player is a separate native mpv window, and `MpvController` already writes a session-specific input configuration passed through `--input-conf`. mpv documents that input configuration bindings override its weak default bindings, so this directly replaces the current Up/Down seek behavior only for Taluxa playback sessions.

**Alternatives considered**:

- Listen for keys in the React `PlayerPage`: rejected because the hidden renderer page does not own keyboard focus while the native mpv window is active.
- Add forced Lua key bindings: rejected because the existing input configuration is the simpler owner for direct key-to-command mappings and avoids coupling keyboard controls to the custom overlay script.
- Modify a repository-level static `input.conf`: rejected because the controller already generates isolated per-session files and no static file exists.

## Decision 2: Set mpv's maximum volume to 100

**Decision**: Add `--volume-max=100` to the mpv launch arguments.

**Rationale**: The mpv `add` command clamps numeric properties at their configured limits, but mpv's documented default maximum volume is 130. The feature contract requires the user-facing range to stop at 100, so an explicit maximum is necessary for correct repeated-key and near-boundary behavior.

**Alternatives considered**:

- Rely on `add volume 10` alone: rejected because it can reach 110–130 under the default mpv limit.
- Implement manual clamping in Lua: rejected because it duplicates behavior already provided by mpv's property limit and would require forced bindings.
- Use a list of fixed volume values: rejected because the specification requires adjustment relative to non-multiple values such as 95, not snapping to a fixed sequence.

## Decision 3: Preserve repeat while suppressing duplicate native OSD

**Decision**: Use `no-osd add volume ±10`, keep key repeat, and rely on the custom bottom control for state feedback.

**Rationale**: mpv repeats continuous volume commands by default. Native OSD duplicated the custom control with a central white bar, so the command prefix suppresses only the native display while the observed volume property keeps the custom control current.

**Alternatives considered**:

- Disable key repeat: rejected because held keys must apply successive 10-point changes.
- Keep native OSD: rejected because it duplicates and obscures the custom player UI.

## Decision 4: Verify generated contracts rather than emulate mpv

**Decision**: Extend `mpvController.test.ts` to assert the generated input text and launch arguments, then perform one manual bundled-runtime check.

**Rationale**: Unit tests can deterministically verify the application-owned contract. Reimplementing mpv command parsing or clamping in the test suite would test a fake instead of the bundled player.

**Alternatives considered**:

- Add a new standalone test file: rejected because the relevant launch and generated-file harness already exists in `mpvController.test.ts`.
- Automate native keyboard input against mpv in Vitest: rejected because it would be platform-sensitive and unsuitable for the existing unit suite.

## Decision 5: Own mouse volume dragging in the embedded Lua UI

**Decision**: Track complex left-button down/move/up events, map pointer X to the visible track bounds, clamp to 0–100, and display the percentage only on knob hover or active drag.

**Rationale**: The Lua overlay already owns hit testing, rendering, and the observed volume state, so it can keep visuals and interaction synchronized without renderer IPC.

**Alternatives considered**:

- HTML range input in the renderer: rejected because the native mpv window owns playback input.
- Click-only control: rejected because the requirement explicitly needs continuous dragging.

## Decision 6: Disable automatic window dragging and restore a bounded explicit region

**Decision**: Launch with `--input-builtin-dragging=no` and call `begin-vo-dragging` only for left-button downs in the top 54px non-button area.

**Rationale**: mpv's built-in input path records every eligible left-button down and, after its default 3px deadzone, begins VO dragging and cancels the current complex binding. This exactly caused volume dragging to become window dragging. Disabling only the automatic path removes the conflict, while the explicit command preserves intentional window movement.

**Alternatives considered**:

- Toggle `window-dragging` after volume down: rejected because mpv records the drag candidate before the asynchronous Lua callback.
- Disable all window movement: rejected because the borderless player still needs a predictable move affordance.
- Raise the deadzone: rejected because it delays rather than removes the ownership conflict.

## Primary Reference

- [mpv reference manual: input configuration, `add`, key repeat, and `volume-max`](https://mpv.io/manual/master/)
