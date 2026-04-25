# Taluxa

Windows desktop Emby player built with Electron, React, TypeScript, and Vite.

## Highlights

- Bundled `mpv` runtime ships with the app so desktop playback works without a separate player install
- Multiple saved Emby accounts grouped by server in the sidebar
- Sidebar switching between remembered users without signing in again
- Friendly server display names appear in the sidebar, home shell, and settings
- Poster-wall home screen for the active account with continue watching, libraries, and featured rows
- Poster artwork falls back through alternate image candidates and then a styled placeholder tile when every image fails
- Featured sort modes include Recently Added and Release Date
- Network settings default to the Windows system proxy
- Proxy mode can switch between the Windows system proxy, direct connection, and a full custom proxy URL
- The same proxy policy is used for Emby requests, poster artwork, and bundled `mpv` playback launches
- Settings page that reflects the currently active account and server

## Development

```bash
npm install
npm run dev
```

## Tests

```bash
npm test
```

## Build

```bash
npm run build
npm run dist
```

## Manual Verification

1. Start the app with `npm run dev`.
2. Sign into one Emby account and confirm the home screen shows continue watching, libraries, and featured rows for that account.
3. Use the sidebar to add a second account, either on the same server or on a different server.
4. Confirm the sidebar groups saved users under each server URL and marks the active account.
5. Switch between users from the sidebar and verify the poster-wall home reloads for the selected account.
6. Open a library and start playback, then confirm the bundled `mpv` handoff view appears, seek forward, close the app, reopen it, and verify resume behavior still works.
7. Trigger an item with a broken primary poster image and confirm the UI retries alternate artwork before showing the styled placeholder tile.
8. Switch the home sort mode between Recently Added and Release Date and confirm the selected mode persists.
9. Open Settings and confirm it shows the active account user name, the active server display name, the active server URL, and that sign-out returns to the login page.
10. Restart the app and confirm remembered accounts are restored and the sidebar still lets you switch accounts.
11. Open Settings and confirm the default proxy mode is `Use Windows system proxy`.
12. Switch the proxy mode to `Direct connection`, save it, and confirm the app still loads libraries without using the Windows system proxy.
13. Switch the proxy mode to `Custom proxy`, enter `http://127.0.0.1:7890`, save it, and confirm Emby login, poster loading, and playback launches still work through that proxy.
14. Enter an invalid custom proxy value such as `127.0.0.1:7890` and confirm the settings page shows the inline proxy error without persisting the change.
