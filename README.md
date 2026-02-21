# ManipulaDB

A cross-platform, native desktop database management application. A local-first, privacy-respecting alternative to tools like TablePlus or DBeaver — built with a Rust backend for performance and a React frontend for a modern developer experience.

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop Runtime | Tauri v2 |
| Backend | Rust |
| DB Driver | SQLx (Postgres, MySQL, SQLite) |
| Frontend | React + TypeScript |
| Bundler | Vite |
| Package Manager | pnpm |
| Styling | Tailwind CSS |
| State Management | Zustand |
| SQL Editor | Monaco Editor |
| Data Grid | TanStack Table + Virtual |

---

## Prerequisites

Before you begin, make sure you have the following installed:

- **Rust** (via [rustup](https://rustup.rs)) — `rustc 1.70+`
- **Node.js** — `v20.19+` or `v22.12+`
- **pnpm** — `v8+` (`npm install -g pnpm`)
- **Xcode Command Line Tools** (macOS) — `xcode-select --install`
- **create-dmg** (macOS, for `.dmg` packaging) — `brew install create-dmg`

Verify your setup:

```sh
rustc --version
cargo --version
node --version
pnpm --version
```

---

## Development

### 1. Install dependencies

```sh
pnpm install
```

### 2. Start the development server

```sh
pnpm tauri dev
```

This command does two things concurrently:

- Starts the **Vite dev server** (React frontend) on `http://localhost:1420` with hot module replacement
- Compiles and runs the **Rust backend** via Cargo, watching `src-tauri/` for changes

The native desktop window will open automatically. Frontend changes reflect instantly via HMR. Rust changes trigger an automatic recompile and restart (takes a few seconds).

### Project Structure

```
manipula-db/
├── src/                        # React frontend
│   ├── components/
│   │   ├── Sidebar/            # Connection list, schema tree
│   │   ├── QueryTab/           # Monaco editor + result pane per tab
│   │   ├── DataTable/          # Virtualized results grid
│   │   └── Modals/             # New connection dialog, confirm dialogs
│   ├── hooks/
│   │   ├── useConnection.ts    # Connect/disconnect, connection state
│   │   ├── useQuery.ts         # Execute query, loading/error states
│   │   └── useTabManager.ts    # Open/close/switch query tabs
│   ├── store/
│   │   ├── connectionStore.ts  # Active connections (Zustand)
│   │   └── tabStore.ts         # Open query tabs (Zustand)
│   ├── lib/
│   │   └── invoke.ts           # Typed wrappers for Tauri invoke()
│   └── main.tsx
│
└── src-tauri/
    └── src/
        ├── db/
        │   ├── mod.rs          # Re-exports
        │   ├── pool_manager.rs # DashMap<connection_id, AnyPool>
        │   └── drivers.rs      # sqlx::AnyPool factory per driver
        ├── commands/
        │   ├── mod.rs
        │   ├── connection.rs   # test_connection, connect_db, disconnect_db
        │   └── query.rs        # execute_query, fetch_schema
        ├── models/
        │   ├── config.rs       # DbConnectionConfig struct
        │   └── result.rs       # QueryResult struct
        └── main.rs             # App builder, state registration
```

### Useful Commands

| Command | Description |
|---|---|
| `pnpm tauri dev` | Start dev server + native window |
| `pnpm dev` | Start Vite only (no Rust, for UI-only work) |
| `cargo check` | Type-check Rust without building (fast) |
| `cargo test` | Run Rust unit tests |
| `pnpm build` | Build the React frontend only |

---

## Release

### Build a native installer

```sh
pnpm tauri build
```

This command:

1. Compiles the React frontend with `vite build` (output: `dist/`)
2. Compiles the Rust backend in **release mode** (`--release`) — fully optimized, no debug symbols
3. Bundles everything into a native installer for your current platform

Output is written to `src-tauri/target/release/bundle/`:

| Platform | Output |
|---|---|
| macOS | `macos/*.app` and `dmg/*.dmg` |
| Windows | `msi/*.msi` and `nsis/*.exe` |
| Linux | `deb/*.deb`, `rpm/*.rpm`, `appimage/*.AppImage` |

### macOS — code signing & notarization

To distribute outside the App Store, you need an **Apple Developer ID** certificate. Set these environment variables before running `pnpm tauri build`:

```sh
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export APPLE_ID="your@email.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"   # App-specific password
export APPLE_TEAM_ID="YOURTEAMID"
```

Tauri will sign and notarize the `.app` and `.dmg` automatically.

### Versioning

The version is defined in two places and must be kept in sync:

- `src-tauri/tauri.conf.json` → `"version": "x.y.z"`
- `src-tauri/Cargo.toml` → `version = "x.y.z"`

Bump both before cutting a release.

### Release checklist

- [ ] Update version in `tauri.conf.json` and `Cargo.toml`
- [ ] Run `cargo test` — all tests pass
- [ ] Run `pnpm tauri build` on each target platform
- [ ] Test the installer on a clean machine
- [ ] Tag the release in git: `git tag v1.x.x && git push --tags`
- [ ] Attach the installer artifacts to the GitHub release

---

## Security

- **Passwords** are never stored on disk or passed back to the frontend. They are stored exclusively in the OS credential vault via the `keyring` crate (macOS Keychain, Windows Credential Manager, Linux Secret Service).
- **Query results** are capped at 50,000 rows by default to prevent IPC memory exhaustion.
- **IPC surface** is minimal — only the specific Tauri commands listed in `tauri.conf.json` capabilities are exposed to the frontend.
