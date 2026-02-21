import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { QueryTab } from "./components/QueryTab";
import { NewConnectionModal } from "./components/Modals/NewConnectionModal";
import { useConnectionStore } from "./store/connectionStore";
import { useTabStore } from "./store/tabStore";

export default function App() {
  const { loadConnections } = useConnectionStore();
  const { tabs, activeTabId, closeTab, setActiveTab } = useTabStore();
  const [showNewConn, setShowNewConn] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const isDragging = { current: false };
  const startX = { current: 0 };
  const startW = { current: 0 };

  useEffect(() => {
    loadConnections().catch(console.error);
  }, []);

  const onResizeStart = (e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    startW.current = sidebarWidth;
    const move = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      setSidebarWidth(
        Math.max(160, Math.min(400, startW.current + ev.clientX - startX.current))
      );
    };
    const up = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    e.preventDefault();
  };

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "var(--bg-primary)" }}>
      {/* Tab bar */}
      <div
        className="flex items-end shrink-0 overflow-x-auto"
        style={{
          background: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border)",
          minHeight: 36,
        }}
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className="flex items-center gap-2 px-4 py-2 cursor-pointer shrink-0 text-xs select-none"
            style={{
              background:
                tab.id === activeTabId ? "var(--bg-primary)" : "transparent",
              color:
                tab.id === activeTabId
                  ? "var(--text-primary)"
                  : "var(--text-muted)",
              borderRight: "1px solid var(--border)",
              borderTop:
                tab.id === activeTabId
                  ? "2px solid var(--accent-light)"
                  : "2px solid transparent",
              minWidth: 100,
              maxWidth: 180,
            }}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="truncate flex-1">{tab.label}</span>
            {tab.isLoading && (
              <span className="animate-spin text-xs" style={{ color: "var(--text-muted)" }}>
                ⟳
              </span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className="text-xs leading-none opacity-50 hover:opacity-100"
              style={{ color: "var(--text-muted)" }}
            >
              ✕
            </button>
          </div>
        ))}
        {tabs.length === 0 && (
          <div
            className="px-4 py-2 text-xs italic"
            style={{ color: "var(--text-muted)" }}
          >
            Open a query tab from the sidebar
          </div>
        )}
      </div>

      {/* Main area: sidebar + content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div
          className="relative flex-shrink-0 h-full"
          style={{ width: sidebarWidth }}
        >
          <Sidebar onNewConnection={() => setShowNewConn(true)} />
        </div>

        {/* Sidebar resize handle */}
        <div
          className="shrink-0 cursor-col-resize"
          style={{
            width: 4,
            background: "var(--border)",
            flexShrink: 0,
          }}
          onMouseDown={onResizeStart}
        />

        {/* Main content */}
        <div className="flex-1 overflow-hidden h-full">
          {activeTab ? (
            <QueryTab key={activeTab.id} tab={activeTab} />
          ) : (
            <div
              className="flex flex-col items-center justify-center h-full gap-4"
              style={{ color: "var(--text-muted)" }}
            >
              <div className="text-4xl opacity-30">⚡</div>
              <p className="text-sm">Select a connection and open a query tab</p>
              <button
                onClick={() => setShowNewConn(true)}
                className="text-sm px-4 py-2 rounded"
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                }}
              >
                + New Connection
              </button>
            </div>
          )}
        </div>
      </div>

      {/* New connection modal */}
      {showNewConn && (
        <NewConnectionModal onClose={() => setShowNewConn(false)} />
      )}
    </div>
  );
}
