Prepare a ManipulaDB release. The new version may be passed as an argument (e.g. `/release 0.2.0`); if not provided, ask the user for it.

## Steps

### 1. Determine the new version

If `$ARGUMENTS` is non-empty, use it as the new version string. Otherwise ask the user:
> What is the new version? (current: read from `src-tauri/tauri.conf.json`)

Validate that the version follows semver (`MAJOR.MINOR.PATCH`). Reject anything else.

### 2. Check current version sync

Read both files:
- `src-tauri/tauri.conf.json` → `version` field
- `src-tauri/Cargo.toml` → `version` field (under `[package]`)

If they differ, stop and report the mismatch so the user can fix it manually before proceeding.

### 3. Pre-release checks

Run the following checks **in sequence** (stop on first failure):

```sh
source ~/.cargo/env && cargo check --manifest-path src-tauri/Cargo.toml 2>&1
```
```sh
pnpm tsc --noEmit 2>&1
```

If either fails, print the error output and stop. Do not bump versions or create a commit on a broken tree.

### 4. Bump versions

Update the version field in both files to the new version:
- `src-tauri/tauri.conf.json`: the `"version"` field at the top level
- `src-tauri/Cargo.toml`: the `version` field under `[package]`

Use the Edit tool (not sed/awk) to make the changes.

### 5. Verify the bump

Re-read both files and confirm the version field in each now matches the new version. If either doesn't match, report the discrepancy and stop.

### 6. Commit the version bump

Stage only the two changed files and create a commit:

```sh
git add src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore: release v{NEW_VERSION}"
```

### 7. Create a git tag

```sh
git tag v{NEW_VERSION}
```

### 8. Report success

Print a summary like:

```
Released v{NEW_VERSION}

Next steps:
  source ~/.cargo/env && pnpm tauri build   # production build (.app + .dmg)
  git push && git push --tags               # push commit + tag to remote
```

Do NOT run the Tauri build automatically — it is slow and the user should trigger it when ready.
