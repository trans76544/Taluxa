# Quickstart: Verify Server Last Played Time

## Automated checks

1. Run `npx vitest run src/shared/store/persistence.test.ts` to verify legacy migration, account isolation, timestamp validation, and monotonic merge.
2. Run `npx vitest run src/renderer/features/player/playbackSync.test.ts src/renderer/features/player/PlaybackSyncProvider.test.tsx` to verify first-frame matching, buffering, deduplication, and account ownership.
3. Run `npx vitest run src/renderer/features/auth/AuthContext.test.tsx src/renderer/components/AccountSidebar.test.tsx src/renderer/app/App.test.tsx` to verify reactive display, no-history text, re-login, and unchanged list interactions.
4. Run `npx vitest run src/electron/main/player/mpvController.test.ts` to verify playback-restart/first-frame behavior for initial and switched items.
5. Run `npm test` and `npm run build` after focused checks pass.

## Manual Windows checks

1. Open an existing account with no app-recorded playback. Confirm its row says “暂无播放记录”, even when a login date exists.
2. Play a movie until its first frame appears. Confirm that account's row shows today's local date and “播放过” within 2 seconds. Restart the application and confirm the same date remains.
3. Start playback on a second server account. Confirm that only its row changes. Repeat with two different accounts on the same server.
4. Keep a player open, select another saved account in the main window, then start a new episode in the player. Confirm the original player's account row changes.
5. Trigger a failed media load and a playback preparation cancellation. Confirm neither changes the date. Seek during a working session and confirm duplicate first-frame events do not move the recorded time.
6. Change a server remark and re-login to an account with history. Confirm the date and list order remain intact. Check logs and persisted date data contain no media URL or credential.

For timing checks, measure from the observed first frame to the sidebar update. The target is at most 2 seconds in representative runs.

## Verification record (2026-09-27)

- Automated first-frame, failed-start, account-isolation, episode-switch, restart-hydration, and no-history scenarios passed in Vitest. The renderer integration test observes the sidebar update after the first-frame event without navigation.
- `npm test -- --reporter=dot`: 56 test files, 565 tests passed. `npm run build`: passed.
- The live Windows playback scenarios above still need a reachable Emby server and a playable account. No actual first-frame-to-sidebar timing was measured in this run.
