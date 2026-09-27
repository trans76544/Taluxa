# Contract: Server Last Played Time

## Internal playback observation

**Producer**: Player startup event stream after a rendered first frame.

**Consumer**: Persistent playback synchronization provider, which resolves the registered playback context.

**Input**: `playerSessionId`, `itemId`, `phase: 'first-frame'`, and the local observation time captured on receipt. The provider accepts an observation only when the session and item match a registered playback context. A first frame received just before registration may be buffered and matched later; stale or mismatched observations are discarded.

**Effect**: Exactly one candidate timestamp is submitted per accepted playback registration. A repeated first frame from seeking does not submit another timestamp. `media-loading`, `media-ready`, player-surface readiness, failed launches, and login events have no effect.

## Persistence contract

**Patch**: `lastPlayedAtByAccountId: { [accountId]: isoTimestamp }`.

**Merge**: The saved account must exist. The stored timestamp for that account becomes the later valid timestamp. Other account keys, saved account credentials, selected account, settings, progress, and cache remain unchanged. Missing map data on older installs reads as an empty map.

**Failure behavior**: A storage failure does not interrupt playback or alter another account's date. A later valid observation can retry the save. No credentials or media source details are included in the patch or any related UI message.

## Sidebar display contract

| Account record | Display below server name |
|---|---|
| Valid recorded playback time | `<用户名> (<本地日期> 播放过)` |
| No valid recorded playback time | `<用户名> (暂无播放记录)` |

The visible list keeps its existing order and interactions. A newly confirmed first frame updates its row in the current application session without requiring navigation, login, or restart.
