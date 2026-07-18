# Quickstart: Verify Automatic Development Bootstrap

## Automated verification

```powershell
npm run test:dev-bootstrap
npm run test:dev-port
npm test
npm run build
git diff --check
```

Bootstrap checks cover skip, locked installation, current npm CLI selection, failure propagation, missing lockfile, and post-install validation. Existing port tests, the complete suite, build, and diff hygiene must remain green.

## Manual existing-install verification

1. Confirm `node_modules/vite/bin/vite.js` exists.
2. Disconnect from the network if practical.
3. Run `npm run dev` and confirm no installation occurs.
4. Confirm Vite starts, then stop the process.

## Manual fresh-clone verification

Use a disposable clone or worktree; do not delete dependencies from an active checkout.

1. Clone into a path containing a space.
2. Confirm the lockfile exists and `node_modules` does not.
3. Run `npm run dev` once.
4. Confirm installation output is visible and Vite starts afterward.
5. Stop and run the command again; confirm installation is skipped.

## Failure verification

Use the injected automated checks to simulate installer failure without contacting the registry or changing real dependencies. Each failure must prevent development-server startup and include actionable error text.
