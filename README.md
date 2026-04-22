# Emby Player

Windows desktop Emby player built with Electron, React, TypeScript, and Vite.

## Highlights

- Multiple saved Emby accounts grouped by server in the sidebar
- Sidebar switching between remembered users without signing in again
- Poster-wall home screen for the active account with continue watching, libraries, and featured rows
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
6. Open a library and start playback, then seek forward, close the app, reopen it, and verify resume behavior still works.
7. Open Settings and confirm it shows the active account user name, the active server URL, and that sign-out returns to the login page.
8. Restart the app and confirm remembered accounts are restored and the sidebar still lets you switch accounts.
