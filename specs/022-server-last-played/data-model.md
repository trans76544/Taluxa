# Data Model: Server Last Played Time

## Persisted playback-date index

`lastPlayedAtByAccountId` is a map from a saved account's existing `id` (`serverUrl::userId`) to a complete ISO 8601 timestamp. It belongs to `PersistedState`, and storage patches contain only changed keys. An absent key means this app has no confirmed playback for that account. The map contains no access token, media URL, title, or item history.

### Validation and merge rules

- Accept only a nonempty account ID and a parseable, finite timestamp normalized to ISO 8601.
- For an existing key, keep the later of the existing and incoming timestamps. A stale or duplicate write cannot move the date backward.
- A malformed persisted value is treated as absent for display and cannot prevent a later valid write.
- A legacy state without the map migrates to an empty map. No login or per-item progress value is used for backfill.
- The account ID must correspond to a saved account before a new observation is recorded. Orphaned map entries never appear in the sidebar because display iterates saved accounts.

## Runtime playback observation

One observation contains `playerSessionId`, `itemId`, the observed first-frame time, and the registration generation that identifies a particular media selection. The runtime coordinator resolves the account ID from the existing `PlaybackReportContext` for that player session. It never stores credentials in the observation.

### State transitions

1. **Unregistered**: A first-frame event may be held briefly as a bounded pending observation for its player session and item.
2. **Registered**: A playback context supplies the account and expected item. A matching first frame becomes **confirmed**.
3. **Confirmed**: The timestamp is submitted once for that registration; seeking or duplicate first-frame events have no effect.
4. **Replaced/closed**: A new context generation can confirm a new item. Closed or mismatched pending observations are released and cannot update a later account.

The main-process timestamp merge handles observations from concurrent player sessions for the same account. A matching event for a background session updates its original account even if another account is currently selected.

## Sidebar projection

Each sidebar row combines a saved account and `lastPlayedAtByAccountId[account.id]`. A valid timestamp produces the account username plus local calendar date and “播放过”. Missing or malformed time produces the username plus “暂无播放记录”. The existing server display name, active state, ordering, and actions are independent of this projection.
