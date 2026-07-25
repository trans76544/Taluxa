# Implementation Plan: Player Arrow-Key Volume Control

**Branch**: `016-adjust-volume-keys` | **Date**: 2026-07-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/016-adjust-volume-keys/spec.md`

## Summary

Override mpv's default Up/Down bindings so volume changes by 10 within 0–100, suppress duplicate native OSD feedback, and extend the embedded Lua UI with a draggable volume track and knob-hover percentage. Disable mpv's automatic whole-window dragging so it cannot cancel a volume drag after the 3px deadzone, then restore intentional window movement through an explicit top-titlebar drag region.

## Technical Context

**Language/Version**: TypeScript 5.6 generating mpv flat-command configuration and an embedded Lua UI script

**Primary Dependencies**: Electron 32, bundled mpv runtime, Node.js built-ins already used by `MpvController`

**Storage**: Per-playback temporary input configuration file; no new persistent application data

**Testing**: Vitest 2.1 generated-contract tests in `src/electron/main/player/mpvController.test.ts`; TypeScript/Vite production build; bundled-mpv option/command compatibility checks; manual playback interaction check

**Target Platform**: Windows desktop application with the bundled mpv playback window

**Project Type**: Electron desktop application with React renderer and a separately launched native mpv player window

**Performance Goals**: Each key, click, or drag update changes volume and visible feedback within 0.5 seconds, with smooth pointer tracking and no measurable playback regression

**Constraints**: Up/Down changes exactly 10; volume clamps to 0–100; native volume OSD stays hidden; dragging remains continuous outside the track; volume dragging never moves the window; top empty space remains draggable; existing shortcuts and adjacent controls remain unchanged

**Scale/Scope**: One input-config generator, one embedded Lua UI generator, one mpv launch argument list, and focused assertions in one existing test file

## Constitution Check

*GATE: Passed before Phase 0 research and re-checked after Phase 1 design.*

The repository constitution is still an unfilled template and defines no enforceable project-specific gates. The plan therefore applies the repository's established engineering practices:

- **PASS - Test first**: Every keyboard, OSD, drag, hover, visibility, and window-drag contract change was introduced through a failing focused assertion.
- **PASS - Narrow ownership**: Input remains in the generated mpv configuration and embedded Lua UI; no renderer listener or second input path is added.
- **PASS - Boundary correctness**: mpv's maximum is 100 and pointer positions are clamped before setting volume.
- **PASS - Regression safety**: F6–F10, Left/Right, mouse wheel, window buttons, center click, and adjacent controls retain their established paths.
- **PASS - No unnecessary state**: Drag state is session-local Lua state; no persistent setting or IPC contract is introduced.

Post-design re-check: the input contract, runtime state model, and verification plan add no architectural layer, external service, security exposure, or constitution violation. All gates remain passed.

## Project Structure

### Documentation (this feature)

```text
specs/016-adjust-volume-keys/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- keyboard-volume.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md                 # generated later by /speckit-tasks
```

### Source Code (repository root)

```text
src/electron/main/player/
|-- mpvController.ts         # generate input.conf, Lua controls, and mpv launch arguments
`-- mpvController.test.ts    # verify keyboard, OSD, drag, hover, launch, and regression contracts
```

**Structure Decision**: Implement the complete interaction in `MpvController`, which owns the session-specific input configuration, Lua overlay, and process arguments. No renderer, preload, shared-model, or persistent-settings changes are required.

## Phase 2 Implementation Sequence

1. Add focused failing expectations that the generated input configuration binds `UP` to `add volume 10`, binds `DOWN` to `add volume -10`, and retains the F6–F10 controls.
2. Add a failing launch expectation for `--volume-max=100`, preserving the remaining mpv argument contract.
3. Suppress native key OSD and remove the redundant top-left volume text.
4. Add click/drag mapping against the visible bottom volume track and show the knob percentage on hover or drag.
5. Keep controls visible for the entire drag lifecycle and preserve click/release semantics.
6. Disable mpv automatic built-in window dragging and explicitly start window movement only from the top 54px non-button region.
7. Verify the bundled mpv exposes `input-builtin-dragging` and `begin-vo-dragging`.
8. Run the focused controller test, full Vitest suite, production build, and manual bundled-player interaction check.

## Complexity Tracking

No constitution violations or additional complexity require justification.
