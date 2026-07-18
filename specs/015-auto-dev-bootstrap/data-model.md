# Runtime Model: Automatic Development Bootstrap

This feature introduces no persistent application entities. Its runtime concepts are:

## Bootstrap Paths

- **repositoryRoot**: Absolute directory containing `package.json` and the lockfile.
- **lockfilePath**: Absolute path to `package-lock.json`.
- **requiredToolPath**: Absolute path to the repository-local Vite CLI.

All paths derive from the executing development script, never another checkout.

## Bootstrap Environment

- **nodeExecutable**: Current Node executable used to run the npm CLI without a shell.
- **npmExecPath**: npm CLI module path supplied by the active `npm run` environment.
- **exists(path)**: Filesystem availability boundary.
- **spawn(command, args, options)**: Installer process boundary.

## State Transitions

```text
CHECK_REQUIRED_TOOL
|-- present ------------------------------> READY
`-- absent --> CHECK_LOCKFILE
              |-- absent -----------------> FAILED
              `-- present --> INSTALLING
                            |-- spawn error -> FAILED
                            |-- nonzero ----> FAILED
                            `-- success ----> VALIDATING
                                            |-- tool absent -> FAILED
                                            `-- tool present -> READY
```

`READY` permits port selection and Vite startup. `FAILED` prevents later startup stages.

## Validation Rules

- Check the required tool before creating an installer process.
- Require the lockfile before installation.
- Install at most once per invocation.
- Validate the tool after a zero installer exit.
- Treat a signal or missing numeric success code as failure.
