import { useEffect, useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { Play, Loader2 } from "lucide-react";
import { useState } from "react";
import { DataTable } from "../DataTable";
import { api } from "../../lib/invoke";
import { useTabStore } from "../../store/tabStore";
import type { Tab } from "../../types";

interface Props {
  tab: Tab;
}

/** Strip a trailing LIMIT / OFFSET clause so we can count the full result set. */
function stripLimitOffset(sql: string): string {
  return sql
    .trim()
    .replace(/;$/, "")
    .trimEnd()
    .replace(/\s+LIMIT\s+\d+(\s*,\s*\d+|\s+OFFSET\s+\d+)?$/i, "")
    .trimEnd();
}

function buildPaginatedSql(baseSql: string, page: number, pageSize: number): string {
  const offset = page * pageSize;
  return `${baseSql}\nLIMIT ${pageSize} OFFSET ${offset};`;
}

export function QueryTab({ tab }: Props) {
  const { setTabSql, setTabResult, setTabLoading, setTabError, setTabPagination } = useTabStore();
  const [editorHeight, setEditorHeight] = useState(220);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  const runQuery = async (
    page = 0,
    pageSize = tab.pageSize,
    inputSql = tab.sql.trim()
  ) => {
    if (!inputSql) return;

    // Strip any user-supplied LIMIT/OFFSET — COUNT needs the full result set
    const baseSql = stripLimitOffset(inputSql);

    setTabLoading(tab.id, true);
    setTabError(tab.id, null);
    try {
      const result = await api.executeQueryPage(tab.connectionId, baseSql, page, pageSize);
      setTabResult(tab.id, result);
      setTabPagination(tab.id, page, pageSize, baseSql);

      // Reflect the actual paginated query in the editor (SELECT queries only)
      if (result.columns.length > 0) {
        setTabSql(tab.id, buildPaginatedSql(baseSql, page, pageSize));
      }
    } catch (e) {
      setTabError(tab.id, String(e));
    }
  };

  const goToPage = (newPage: number) => {
    if (tab.isLoading || !tab.paginationSql) return;
    runQuery(newPage, tab.pageSize, tab.paginationSql);
  };

  const changePageSize = (newSize: number) => {
    if (tab.isLoading || !tab.paginationSql) return;
    runQuery(0, newSize, tab.paginationSql);
  };

  const hasAutoRun = useRef(false);
  useEffect(() => {
    if (tab.autoRun && !hasAutoRun.current) {
      hasAutoRun.current = true;
      runQuery(0, tab.pageSize, tab.sql.trim());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editor.addAction({
      id: "manipula.runQuery",
      label: "Run Query",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => runQuery(0, tab.pageSize),
    });
  };

  const onResizeStart = (e: React.MouseEvent) => {
    isDragging.current = true;
    startY.current = e.clientY;
    startH.current = editorHeight;
    const move = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      setEditorHeight(
        Math.max(80, Math.min(600, startH.current - (ev.clientY - startY.current)))
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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Results */}
      <div className="flex-1 overflow-hidden">
        {tab.error ? (
          <div className="p-4 overflow-auto h-full">
            <div
              className="p-3 rounded text-xs mono"
              style={{
                background: "rgba(244, 135, 113, 0.08)",
                border: "1px solid var(--error)",
                color: "var(--error)",
                whiteSpace: "pre-wrap",
                lineHeight: 1.6,
              }}
            >
              <span className="font-semibold not-mono" style={{ fontFamily: "inherit" }}>Error  </span>
              {tab.error}
            </div>
          </div>
        ) : tab.result ? (
          <DataTable
            result={tab.result}
            page={tab.page}
            pageSize={tab.pageSize}
            onPageChange={goToPage}
            onPageSizeChange={changePageSize}
          />
        ) : (
          <div
            className="flex items-center justify-center h-full text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            {tab.isLoading ? "Executing query…" : "Results will appear here"}
          </div>
        )}
      </div>

      {/* Resize handle */}
      <div className="resize-handle" onMouseDown={onResizeStart} />

      {/* Editor toolbar */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <button
          onClick={() => runQuery(0, tab.pageSize)}
          disabled={tab.isLoading}
          className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium"
          style={{
            background: tab.isLoading ? "var(--bg-tertiary)" : "var(--accent)",
            color: tab.isLoading ? "var(--text-muted)" : "#fff",
          }}
          title="Run query (⌘+Enter)"
        >
          {tab.isLoading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Play size={11} />
          )}
          {tab.isLoading ? "Running…" : "Run"}
        </button>
        <span className="text-xs ml-auto" style={{ color: "var(--text-muted)" }}>
          ⌘+Enter to run
        </span>
      </div>

      {/* Monaco editor */}
      <div style={{ height: editorHeight, flexShrink: 0 }}>
        <Editor
          height="100%"
          language="sql"
          theme="vs-dark"
          value={tab.sql}
          onChange={(v) => setTabSql(tab.id, v ?? "")}
          onMount={handleEditorMount}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            padding: { top: 8, bottom: 8 },
            quickSuggestions: true,
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
}
