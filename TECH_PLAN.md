# ManipulaDB — Detailed Technical Plan

## Overview

ManipulaDB is a cross-platform, native desktop database management application. It functions as a local-first, privacy-respecting alternative to tools like TablePlus or DBeaver — built with a Rust backend for performance and a React frontend for a modern developer experience.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Desktop Runtime | Tauri v2 | Native window, IPC bridge, OS APIs |
| Backend | Rust | DB connections, query execution, security |
| DB Driver | SQLx | Async, multi-driver (Postgres, MySQL, SQLite) |
| Frontend | React + TypeScript | UI rendering |
| Bundler | Vite | Fast HMR dev server |
| Package Manager | pnpm | Monorepo-friendly dependency management |
| Styling | Tailwind CSS | Utility-first UI styling |
| State Management | Zustand | Lightweight global state |
| Code Editor | `@monaco-editor/react` | Full-featured SQL editor (VS Code engine) |
| Data Grid | `@tanstack/react-table` | Virtualized, sortable, filterable table |
| Credential Storage | `keyring` crate | OS-native secret vault (Keychain / DPAPI) |

---

## Project Structure

```
manipula-db/
├── src/                          # React Frontend
│   ├── components/
│   │   ├── Sidebar/              # Connection list, schema tree
│   │   ├── QueryTab/             # Monaco editor + result pane per tab
│   │   ├── DataTable/            # Virtualized results grid
│   │   └── Modals/               # New connection dialog, confirm dialogs
│   ├── hooks/
│   │   ├── useConnection.ts      # Connect/disconnect, connection state
│   │   ├── useQuery.ts           # Execute query, loading/error states
│   │   └── useTabManager.ts      # Open/close/switch query tabs
│   ├── store/
│   │   ├── connectionStore.ts    # Active connections (Zustand)
│   │   └── tabStore.ts           # Open query tabs (Zustand)
│   ├── lib/
│   │   └── invoke.ts             # Typed wrappers for Tauri invoke()
│   └── main.tsx
│
└── src-tauri/
    └── src/
        ├── db/
        │   ├── mod.rs            # Re-exports
        │   ├── pool_manager.rs   # DashMap<connection_id, AnyPool>
        │   └── drivers.rs        # sqlx::AnyPool factory per driver
        ├── commands/
        │   ├── mod.rs
        │   ├── connection.rs     # test_connection, connect_db, disconnect_db
        │   └── query.rs          # execute_query, fetch_schema
        ├── models/
        │   ├── config.rs         # DbConnectionConfig struct
        │   └── result.rs         # QueryResult struct
        └── main.rs               # App builder, state registration
```

---

## Backend Architecture (Rust)

### 1. Application State & Thread Safety

The core challenge is managing multiple simultaneous DB connections across multiple UI tabs. The solution is a `DashMap`-backed pool manager registered as Tauri managed state — avoiding a single global `Mutex` bottleneck.

```
AppState {
    pools: DashMap<String, sqlx::AnyPool>
    //             ^id      ^live pool
}
```

`DashMap` provides shard-locked concurrent reads/writes without a single lock point, which is critical for a multi-tab UI.

### 2. Core Data Models

**`DbConnectionConfig`** — the config payload sent from the frontend when a user creates a connection:

```rust
#[derive(Serialize, Deserialize, Clone)]
pub struct DbConnectionConfig {
    pub id: String,           // UUID, generated on frontend
    pub name: String,         // Display name
    pub driver: String,       // "postgres" | "mysql" | "sqlite"
    pub host: Option<String>,
    pub port: Option<u16>,
    pub database: Option<String>,
    pub username: Option<String>,
    // password is NEVER stored here — fetched from keyring at connect time
}
```

**`QueryResult`** — the universal response for any SQL execution:

```rust
#[derive(Serialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<serde_json::Value>,  // Array of {col: value} objects
    pub rows_affected: Option<u64>,   // For INSERT/UPDATE/DELETE
    pub execution_time_ms: u64,
    pub truncated: bool,              // true if row cap was hit
}
```

### 3. Tauri Commands

| Command | Inputs | Action |
|---|---|---|
| `test_connection` | `DbConnectionConfig` + password | Attempt connect, return ok/err, do NOT store pool |
| `connect_db` | `DbConnectionConfig` + password | Connect, store pool in AppState, return success |
| `disconnect_db` | `connection_id: String` | Remove pool from AppState, close connections |
| `execute_query` | `connection_id`, `sql: String`, `limit: Option<u32>` | Run query, return `QueryResult` |
| `fetch_schema` | `connection_id` | Return tables/views/columns tree for sidebar |
| `save_connection` | `DbConnectionConfig` | Persist config to disk (sans password), store password in keyring |
| `load_connections` | — | Load saved configs from disk |
| `delete_connection` | `connection_id` | Remove config from disk, delete from keyring |

### 4. Security Implementation

- **Passwords:** Stored exclusively via the `keyring` crate under the key `manipuladb-{connection_id}`. Never serialized to disk or passed over the IPC bridge back to the frontend.
- **Row Cap:** `execute_query` enforces a hard `LIMIT` override — default **50,000 rows** — to prevent IPC memory exhaustion. `truncated: true` is returned when the cap is hit.
- **SQL Injection:** Not applicable (user is the author of their own SQL). Raw query execution is intentional by design — this is a DB admin tool.
- **Tauri Capabilities:** Lock down IPC in `tauri.conf.json` — only expose the specific commands listed above, no filesystem or shell access from the frontend beyond what Tauri provides by default.

---

## Frontend Architecture (React)

### 1. Layout

```
┌─────────────────────────────────────────────────┐
│  [ManipulaDB]                          [─][□][✕] │  <- Tauri titlebar
├───────────┬─────────────────────────────────────┤
│           │  [Tab 1: query.sql] [Tab 2: +]       │  <- Tab bar
│ Sidebar   ├─────────────────────────────────────┤
│           │  ┌──────────────────────────────┐   │
│ ▼ Conn 1  │  │  Monaco SQL Editor           │   │  <- Editor pane
│   tables  │  │                              │   │
│   views   │  └──────────────────────────────┘   │
│           │  ─────── Results ──────────────────  │
│ ▶ Conn 2  │  ┌──────────────────────────────┐   │
│           │  │  Virtualized Data Grid        │   │  <- Results pane
│ [+] New   │  └──────────────────────────────┘   │
└───────────┴─────────────────────────────────────┘
```

### 2. Key Components

**`<Sidebar />`**
- Lists saved connections loaded via `load_connections` on app start
- Expandable tree: Connection → Schemas → Tables → Columns
- Right-click context menu: Connect, Disconnect, Edit, Delete
- "New Connection" button opens a modal form

**`<QueryTab />`**
- One instance per open tab, managed by `tabStore`
- Contains `<MonacoEditor />` and `<ResultPane />`
- Keybinding: `Ctrl+Enter` / `Cmd+Enter` triggers `execute_query`
- Shows execution time and row count in a status bar below the grid

**`<DataTable />`**
- Built on `@tanstack/react-table` with `@tanstack/react-virtual` for row virtualization
- Handles 50k rows without jank by only rendering DOM nodes in the viewport
- Column headers: click to sort, drag to resize
- Global search filter box above the table
- Cell values: right-click to copy, null values displayed distinctly (e.g., grayed `NULL`)

**`<NewConnectionModal />`**
- Driver selector (Postgres / MySQL / SQLite)
- Dynamic form fields (SQLite shows only a file path picker)
- Password field (never stored in component state longer than needed for the IPC call)
- "Test Connection" button calls `test_connection` before saving

### 3. State Management (Zustand)

**`connectionStore`**
```typescript
{
  savedConnections: DbConnectionConfig[]  // loaded from backend
  activeConnectionIds: Set<string>        // currently connected
  loadConnections: () => Promise<void>
  connectTo: (id: string, password: string) => Promise<void>
  disconnect: (id: string) => Promise<void>
}
```

**`tabStore`**
```typescript
{
  tabs: Tab[]           // { id, connectionId, sql, result, isLoading }
  activeTabId: string
  openTab: (connectionId: string) => void
  closeTab: (tabId: string) => void
  setTabSql: (tabId: string, sql: string) => void
  setTabResult: (tabId: string, result: QueryResult) => void
}
```

---

## Implementation Roadmap

### Phase 1 — Foundation
1. Initialize Tauri v2 project with Vite + React + TypeScript
2. Configure `pnpm`, Tailwind CSS, `tsconfig`
3. Set up Rust module structure (`db/`, `commands/`, `models/`)
4. Implement `AppState` with `DashMap` pool manager
5. Implement `connect_db` and `disconnect_db` commands
6. Wire up basic frontend: sidebar shell + connection modal (no styling yet)

### Phase 2 — Query Engine
7. Implement `execute_query` with row cap and timing
8. Implement `fetch_schema` to populate sidebar tree
9. Build `<DataTable />` with virtualization
10. Build `<QueryTab />` with Monaco editor + Ctrl+Enter keybinding
11. Connect frontend to backend via typed `invoke.ts` wrappers

### Phase 3 — Persistence & Security
12. Implement `save_connection` using `keyring` for passwords
13. Implement `load_connections` and `delete_connection`
14. Wire sidebar to load saved connections on app start
15. Add `test_connection` with UI feedback in the new connection modal

### Phase 4 — Polish
16. Schema sidebar tree with lazy loading per table
17. Tab persistence (restore tabs on app restart using localStorage)
18. Error display: SQL parse errors, connection failures shown inline
19. Result export: copy as CSV / JSON from the data grid
20. Keyboard shortcut reference panel

---

## Key Technical Decisions & Rationale

| Decision | Rationale |
|---|---|
| `DashMap` over `Arc<Mutex<HashMap>>` | Avoids single-lock bottleneck; multiple tabs can query simultaneously |
| `sqlx::Any` driver | Single unified pool API across Postgres, MySQL, SQLite |
| `serde_json::Value` for rows | Schema is unknown at compile time; dynamic JSON is the only viable approach |
| `@tanstack/react-virtual` | Required to handle 50k rows in DOM without freezing the UI thread |
| `keyring` crate | OS-native credential storage — no custom encryption implementation needed |
| Zustand over Redux | Minimal boilerplate; sufficient for this app's state complexity |
| Monaco over CodeMirror | Superior SQL IntelliSense ecosystem and familiar VS Code keybindings |
