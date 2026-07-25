# Quickstart: Player Arrow-Key Volume Control

## Implementation

1. Generate `UP no-osd add volume 10` and `DOWN no-osd add volume -10`.
2. Launch every mpv session with `--volume-max=100` and `--input-builtin-dragging=no`.
3. Map clicks and complex left-button drag events to the visible bottom volume track.
4. Draw the current percentage above the knob only while hovering the knob or dragging.
5. Start explicit window movement only when pressing the top 54px non-button area.
6. Keep F6–F10, Left/Right, mouse-wheel delta, window buttons, renderer, and settings persistence unchanged.

## Automated Verification

Run the focused test:

```powershell
.\node_modules\.bin\vitest.cmd run src/electron/main/player/mpvController.test.ts
```

Run the full test suite:

```powershell
npm test
```

Run the production type/build check:

```powershell
npm run build
```

## Manual Verification

1. Start the application and open any playable item.
2. Set volume to 40 using the player control.
3. Press Up once and confirm the bottom control becomes 50 without a central white bar or top-left volume text.
4. Press Down once and confirm it returns to 40 without native OSD.
5. Set volume to 95, press Up, and confirm it stops at 100.
6. Set volume to 5, press Down, and confirm it stops at 0.
7. Hold Up or Down and confirm repeated 10-point changes stop at the boundary.
8. Click the volume track at several positions and confirm proportional values.
9. Drag the volume knob beyond both endpoints and confirm continuous updates clamp at 0 and 100 without moving the window.
10. Hover the knob and confirm the current percentage appears at the same size as the progress time labels.
11. Drag the top empty titlebar area and confirm the window moves; confirm pin, minimize, maximize, and close remain clickable.
12. Confirm center click, video double-click, Left/Right, F6–F10, and mouse-wheel volume retain their existing behavior.

## Verification Results

- Focused controller test: 50/50 passed.
- Full test suite: 52/52 files and 497/497 tests passed.
- Production build: TypeScript checking and all renderer, main, and preload Vite builds passed.
- Generated input contract: exactly one `UP no-osd add volume 10` and one `DOWN no-osd add volume -10`; no Left/Right override; F6–F10 retained.
- Launch contract: every tested mpv launch path includes `--volume-max=100` and `--input-builtin-dragging=no`.
- Bundled mpv compatibility: `input-builtin-dragging` and `begin-vo-dragging` are both available.
- User runtime observation: the original drag implementation reproduced mpv window takeover after a few pixels; commit `8980fdb` addresses the traced 3px built-in deadzone.
- Manual post-fix Windows interaction: pending user confirmation after restarting from the feature worktree.
