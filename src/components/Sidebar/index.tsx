import { useState } from "react";
import { useConnectionStore } from "../../store/connectionStore";
import { useTabStore } from "../../store/tabStore";
import type { DbConnectionConfig } from "../../types";

interface Props {
  onNewConnection: () => void;
}

export function Sidebar({ onNewConnection }: Props) {
  const {
    savedConnections,
    schemaMap,
    connectTo,
    disconnect,
    deleteConnection,
    isConnected,
  } = useConnectionStore();
  const { openTab } = useTabStore();

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [passwordPrompt, setPasswordPrompt] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    conn: DbConnectionConfig;
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DbConnectionConfig | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleTable = (key: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleConnect = (conn: DbConnectionConfig) => {
    if (isConnected(conn.id)) {
      toggleExpand(conn.id);
      return;
    }
    setPasswordPrompt({ id: conn.id, name: conn.name });
    setPasswordInput("");
  };

  const submitPassword = async () => {
    if (!passwordPrompt) return;
    setConnectingId(passwordPrompt.id);
    try {
      await connectTo(passwordPrompt.id, passwordInput);
      setExpandedIds((prev) => new Set([...prev, passwordPrompt.id]));
    } catch (e) {
      alert(`Connection failed: ${e}`);
    } finally {
      setConnectingId(null);
      setPasswordPrompt(null);
      setPasswordInput("");
    }
  };

  const handleDisconnect = async (id: string) => {
    await disconnect(id);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleDelete = async (id: string) => {
    await deleteConnection(id);
    setDeleteConfirm(null);
  };

  const handleOpenTab = (conn: DbConnectionConfig) => {
    openTab(conn.id, conn.name);
  };

  const handleContextMenu = (
    e: React.MouseEvent,
    conn: DbConnectionConfig
  ) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, conn });
  };

  const driverIcon = (driver: string) => {
    switch (driver) {
      case "postgres":
        return "🐘";
      case "mysql":
        return "🐬";
      case "sqlite":
        return "📁";
      default:
        return "🗄️";
    }
  };

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: "var(--bg-secondary)", borderRight: "1px solid var(--border)" }}
      onClick={() => setContextMenu(null)}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          Connections
        </span>
        <button
          onClick={onNewConnection}
          title="New connection"
          className="text-base leading-none px-1"
          style={{ color: "var(--accent-light)" }}
        >
          +
        </button>
      </div>

      {/* Connection list */}
      <div className="flex-1 overflow-y-auto py-1">
        {savedConnections.length === 0 && (
          <div
            className="text-xs text-center mt-6 px-4"
            style={{ color: "var(--text-muted)" }}
          >
            No connections yet.
            <br />
            <button
              onClick={onNewConnection}
              className="mt-2 underline"
              style={{ color: "var(--accent-light)" }}
            >
              Add one
            </button>
          </div>
        )}

        {savedConnections.map((conn) => {
          const connected = isConnected(conn.id);
          const expanded = expandedIds.has(conn.id);
          const schema = schemaMap[conn.id] ?? [];
          const isConnecting = connectingId === conn.id;

          return (
            <div key={conn.id}>
              {/* Connection row */}
              <div
                className="flex items-center gap-2 px-3 py-1.5 cursor-pointer select-none"
                style={{
                  background: expanded ? "var(--bg-hover)" : "transparent",
                  color: "var(--text-primary)",
                }}
                onClick={() => handleConnect(conn)}
                onContextMenu={(e) => handleContextMenu(e, conn)}
              >
                <span className="text-sm">{driverIcon(conn.driver)}</span>
                <span className="flex-1 truncate" style={{ fontSize: 13 }}>{conn.name}</span>
                {connected && (
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: "var(--success)" }}
                    title="Connected"
                  />
                )}
                {isConnecting && (
                  <span className="text-xs animate-pulse" style={{ color: "var(--text-muted)" }}>
                    …
                  </span>
                )}
                {connected && (
                  <span
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {expanded ? "▾" : "▸"}
                  </span>
                )}
              </div>

              {/* Schema tree */}
              {connected && expanded && (
                <div>
                  {/* Open tab button */}
                  <div
                    className="flex items-center gap-2 pl-8 pr-3 py-1 cursor-pointer"
                    style={{ color: "var(--accent-light)", fontSize: 13 }}
                    onClick={() => handleOpenTab(conn)}
                  >
                    + New query
                  </div>

                  {schema.length === 0 && (
                    <div
                      className="pl-8 py-1"
                      style={{ color: "var(--text-muted)", fontSize: 13 }}
                    >
                      Loading schema…
                    </div>
                  )}

                  {schema.map((table) => {
                    const tableKey = `${conn.id}:${table.table_name}`;
                    const tableExpanded = expandedTables.has(tableKey);
                    return (
                      <div key={table.table_name}>
                        <div
                          className="flex items-center gap-1.5 pl-8 pr-3 py-0.5 cursor-pointer hover:bg-[var(--bg-hover)] select-none"
                          style={{ color: "var(--text-primary)", fontSize: 13 }}
                          onClick={() => toggleTable(tableKey)}
                          onDoubleClick={() => openTab(conn.id, conn.name, `SELECT * FROM ${table.table_name} LIMIT 100;`, table.table_name)}
                        >
                          <span style={{ color: "var(--text-muted)" }}>
                            {tableExpanded ? "▾" : "▸"}
                          </span>
                          <span>
                            {table.table_type === "view" ? "👁 " : "▤ "}
                            {table.table_name}
                          </span>
                        </div>
                        {tableExpanded &&
                          table.columns.map((col) => (
                            <div
                              key={col.column_name}
                              className="flex items-center gap-2 pl-14 pr-3 py-0.5"
                              style={{ color: "var(--text-muted)", fontSize: 13 }}
                            >
                              <span className="truncate">{col.column_name}</span>
                              <span
                                className="ml-auto shrink-0"
                                style={{ color: "var(--text-muted)", opacity: 0.6, fontSize: "11px" }}
                              >
                                {col.data_type}
                              </span>
                            </div>
                          ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Password prompt overlay */}
      {passwordPrompt && (
        <div
          className="absolute inset-0 z-30 flex items-end"
          style={{ background: "rgba(0,0,0,0.5)" }}
        >
          <div
            className="w-full p-4 flex flex-col gap-3"
            style={{ background: "var(--bg-tertiary)", borderTop: "1px solid var(--border)" }}
          >
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Connect to <em>{passwordPrompt.name}</em>
            </p>
            <input
              autoFocus
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitPassword();
                if (e.key === "Escape") setPasswordPrompt(null);
              }}
              placeholder="Password"
              className="w-full px-3 py-1.5 rounded text-sm outline-none"
              style={{
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setPasswordPrompt(null)}
                className="text-xs px-3 py-1"
                style={{ color: "var(--text-muted)" }}
              >
                Cancel
              </button>
              <button
                onClick={submitPassword}
                className="text-xs px-4 py-1 rounded font-medium"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                Connect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div
          className="absolute inset-0 z-40 flex items-end"
          style={{ background: "rgba(0,0,0,0.5)" }}
        >
          <div
            className="w-full p-4 flex flex-col gap-3"
            style={{ background: "var(--bg-tertiary)", borderTop: "1px solid var(--border)" }}
          >
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Delete <em>{deleteConfirm.name}</em>?
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="text-xs px-3 py-1"
                style={{ color: "var(--text-muted)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm.id)}
                className="text-xs px-4 py-1 rounded font-medium"
                style={{ background: "var(--error)", color: "#fff" }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 rounded shadow-lg py-1"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border)",
            minWidth: 160,
          }}
        >
          {isConnected(contextMenu.conn.id) ? (
            <>
              <MenuItem
                label="New Query Tab"
                onClick={() => {
                  handleOpenTab(contextMenu.conn);
                  setContextMenu(null);
                }}
              />
              <MenuItem
                label="Refresh Schema"
                onClick={async () => {
                  await useConnectionStore
                    .getState()
                    .loadSchema(contextMenu.conn.id);
                  setContextMenu(null);
                }}
              />
              <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
              <MenuItem
                label="Disconnect"
                onClick={async () => {
                  await handleDisconnect(contextMenu.conn.id);
                  setContextMenu(null);
                }}
              />
            </>
          ) : (
            <MenuItem
              label="Connect"
              onClick={() => {
                handleConnect(contextMenu.conn);
                setContextMenu(null);
              }}
            />
          )}
          <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
          <MenuItem
            label="Delete"
            danger
            onClick={() => {
              setDeleteConfirm(contextMenu.conn);
              setContextMenu(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-1.5 text-xs"
      style={{
        color: danger ? "var(--error)" : "var(--text-primary)",
        background: "transparent",
      }}
      onMouseEnter={(e) =>
        ((e.target as HTMLButtonElement).style.background = "var(--bg-hover)")
      }
      onMouseLeave={(e) =>
        ((e.target as HTMLButtonElement).style.background = "transparent")
      }
    >
      {label}
    </button>
  );
}
