# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

ManipulaDB is a native desktop database management app (TablePlus/DBeaver alternative) built with **Tauri v2** (Rust backend + React frontend). Rust handles all DB connections and query execution; React handles all UI.

## Commands

```sh
# Development (starts Vite + Rust watch, opens native window)
pnpm tauri dev

# Frontend only (no Rust, for UI-only work)
pnpm dev

# Type-check Rust without a full build (fast)
source ~/.cargo/env && cargo check --manifest-path src-tauri/Cargo.toml

# Run Rust tests
source ~/.cargo/env && cargo test --manifest-path src-tauri/Cargo.toml

# Production build (outputs .app + .dmg on macOS)
source ~/.cargo/env && pnpm tauri build
```

> **Important:** `cargo` is at `~/.cargo/bin/cargo` and is not on the default shell PATH. Always `source ~/.cargo/env` before running any `cargo` or `pnpm tauri` commands in a new shell.

Build output: `src-tauri/target/release/bundle/`

## Versioning

Version must be kept in sync across two files before any release:
- `src-tauri/tauri.conf.json` → `"version"`
- `src-tauri/Cargo.toml` → `version`

## UI Development Workflow

When making any changes to the React frontend (components, styles, layout), use the **Playwright MCP** to visually verify the result in the browser after changes are applied.

### Steps

1. Start the frontend dev server if it isn't already running:
   ```sh
   pnpm dev
   ```
   The app will be available at `http://localhost:1420` (Vite default for Tauri projects).

2. After applying UI changes, use Playwright MCP to:
   - **Navigate** to `http://localhost:1420`
   - **Take a screenshot** to inspect the visual result
   - **Interact** with the changed component (click buttons, hover elements, fill forms) to confirm behaviour
   - **Check responsive layout** by resizing the viewport if relevant

3. If the screenshot reveals issues (broken layout, missing hover states, wrong colours, overlapping elements), fix them and re-check before finishing.

### What to check per component

| Component | Key things to verify |
|---|---|
| `Sidebar` | Connection row hover highlight, password prompt error display, context menu positioning |
| `QueryTab` | Editor renders, Run button state, error box styling, resize handle |
| `DataTable` | Row numbers visible, Copy button works, filter clear (×) appears, column headers sortable |
| `NewConnectionModal` | Driver tab icons, ESC closes modal, backdrop click closes modal, test result message |
| `App` | Sidebar resize handle highlights on hover and during drag, tab bar overflow, empty state |

> **Note:** The Tauri IPC bridge is not available in the browser (`pnpm dev` only). Features that call `invoke()` will not work — use `pnpm tauri dev` for full end-to-end testing. For UI-only changes `pnpm dev` + Playwright is sufficient.

## Architecture

### IPC Flow

All communication crosses the Tauri IPC bridge via typed wrappers in `src/lib/invoke.ts`. The frontend never touches a database directly. The pattern is:

```
React Component → Zustand store action → invoke.ts typed wrapper → Tauri command (Rust) → sqlx → DB
```

### Rust Backend (`src-tauri/src/`)

| Module | Responsibility |
|---|---|
| `db/pool_manager.rs` | `AppState` — `DashMap<String, ConnectionEntry>` holding live sqlx pools, registered as Tauri managed state |
| `db/drivers.rs` | Factory that builds an `AnyPool` (or `PgPool`) from a `DbConnectionConfig` + password |
| `commands/connection.rs` | `test_connection`, `connect_db`, `disconnect_db`, `save_connection`, `load_connections`, `delete_connection`, `get_connection_password` |
| `commands/query.rs` | `execute_query`, `fetch_schema` |
| `models/config.rs` | `DbConnectionConfig` — password is **never** a field here |
| `models/result.rs` | `QueryResult` — `columns: Vec<String>`, `rows: Vec<serde_json::Value>`, plus `rows_affected`, `execution_time_ms`, `truncated` |

**Key implementation details:**
- `sqlx::any::install_default_drivers()` must be called once at startup (see `lib.rs`) before any pool is created.
- Postgres gets a native `PgPool` in addition to the `AnyPool` for better type decoding. MySQL/SQLite use `AnyPool` only.
- `execute_query` caps results at **50,000 rows** (`truncated: true` when hit).
- Row decoding is DB-specific: `pg_extract_value()` for Postgres (`PgRow`), `any_extract_value()` for MySQL/SQLite (`AnyRow`). MySQL has extra casting for unsupported types (tinyint, bit, decimal, json, datetime).
- `fetch_schema` uses `information_schema` for Postgres/MySQL and `sqlite_master` + `PRAGMA table_info()` for SQLite.
- Passwords are stored exclusively in the OS keyring (`keyring` crate, service name `"manipuladb"`, key `"connection-{id}"`). They are never serialized to disk and never returned over IPC.
- Saved connections (no passwords) live in `~/.config/manipula-db/connections.json` (via Tauri's app data dir).

### React Frontend (`src/`)

| Path | Responsibility |
|---|---|
| `src/lib/invoke.ts` | All typed wrappers around `invoke()` — single source of truth for IPC calls |
| `src/store/connectionStore.ts` | Zustand store: `savedConnections`, `activeConnectionIds`, `schemaMap` |
| `src/store/tabStore.ts` | Zustand store: `tabs[]`, `activeTabId` |
| `src/types.ts` | Shared TypeScript types matching the Rust model structs |
| `src/components/Sidebar/` | Connection tree with expandable schema, connect/disconnect, double-click table to open a pre-filled query tab |
| `src/components/QueryTab/` | Monaco SQL editor + result pane; `Cmd+Enter` runs query; supports `tab.autoRun` flag |
| `src/components/DataTable/` | TanStack Table + Virtual; sortable columns; global filter; NULL displayed in italics; 50k row virtual scroll |
| `src/components/Modals/NewConnectionModal.tsx` | Driver tabs (Postgres/MySQL/SQLite), dynamic form, test-before-save flow |

**Styling:** Dark theme via CSS variables in `src/index.css` (`--bg-primary: #1e1e1e`, `--accent: #0e639c`, etc.). Tailwind CSS v4 is used for layout utilities. Do not inline hex colors — use the CSS variables.

### Data Flow for a Query

1. User types SQL in `QueryTab` (Monaco editor), presses `Cmd+Enter`
2. `QueryTab` calls `tabStore.setTabLoading(tabId, true)`, then `invoke.executeQuery(connectionId, sql)`
3. Rust `execute_query` command: looks up pool in `AppState.connections`, runs query, decodes rows to `serde_json::Value`, returns `QueryResult`
4. `QueryTab` calls `tabStore.setTabResult(tabId, result)` → `DataTable` renders virtualized rows

### Data Flow for a New Connection

1. `NewConnectionModal` calls `invoke.testConnection(config, password)` on "Test" click
2. On save: `invoke.saveConnection(config, password)` → Rust stores password in keyring, config to JSON file
3. `connectionStore.loadConnections()` is called on app start (in `App.tsx` `useEffect`) to populate the sidebar
4. "Connect" in sidebar: `connectionStore.connectTo(id, password)` → `invoke.getConnectionPassword(id)` (from keyring) → `invoke.connectDb(config, password)` → pool stored in `AppState`
