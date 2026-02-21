import { useRef, useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { QueryResult } from "../../types";

interface Props {
  result: QueryResult;
}

const ROW_HEIGHT = 28;

export function DataTable({ result }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      result.columns.map((col) => ({
        accessorKey: col,
        header: col,
        size: 160,
        cell: ({ getValue }) => {
          const v = getValue();
          if (v === null || v === undefined) {
            return (
              <span style={{ color: "var(--null-color)", fontStyle: "italic" }}>
                NULL
              </span>
            );
          }
          return String(v);
        },
      })),
    [result.columns]
  );

  const table = useReactTable({
    data: result.rows as Record<string, unknown>[],
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const { rows } = table.getRowModel();

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  const paddingTop =
    virtualItems.length > 0 ? (virtualItems[0]?.start ?? 0) : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? totalSize - (virtualItems[virtualItems.length - 1]?.end ?? 0)
      : 0;

  if (result.columns.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-full text-sm"
        style={{ color: "var(--text-muted)" }}
      >
        {result.rows_affected !== null
          ? `${result.rows_affected} row${result.rows_affected === 1 ? "" : "s"} affected in ${result.execution_time_ms}ms`
          : "No results"}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <input
          type="text"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Filter results…"
          className="w-48 px-2 py-0.5 rounded text-xs outline-none"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
          }}
        />
        <span
          className="text-xs ml-auto"
          style={{ color: "var(--text-muted)" }}
        >
          {rows.length.toLocaleString()} row{rows.length !== 1 ? "s" : ""}
          {result.truncated && (
            <span style={{ color: "var(--warning)" }}> · truncated at 50,000</span>
          )}
          {" · "}
          {result.execution_time_ms}ms
        </span>
      </div>

      {/* Table */}
      <div
        ref={tableContainerRef}
        className="flex-1 overflow-auto"
      >
        <table
          className="border-collapse mono"
          style={{ minWidth: "max-content", width: "100%" }}
        >
          <thead
            style={{
              background: "var(--bg-secondary)",
              position: "sticky",
              top: 0,
              zIndex: 1,
            }}
          >
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className="text-left px-3 text-xs font-medium select-none"
                    style={{
                      height: 32,
                      color: "var(--text-secondary)",
                      borderRight: "1px solid var(--border)",
                      borderBottom: "1px solid var(--border)",
                      cursor: header.column.getCanSort() ? "pointer" : "default",
                      whiteSpace: "nowrap",
                      width: header.getSize(),
                    }}
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                    {header.column.getIsSorted() === "asc"
                      ? " ↑"
                      : header.column.getIsSorted() === "desc"
                      ? " ↓"
                      : ""}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody>
            {paddingTop > 0 && (
              <tr>
                <td colSpan={columns.length} style={{ height: paddingTop }} />
              </tr>
            )}

            {virtualItems.map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <tr
                  key={row.id}
                  style={{
                    height: ROW_HEIGHT,
                    background:
                      virtualRow.index % 2 === 0
                        ? "var(--bg-primary)"
                        : "var(--bg-secondary)",
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-3 text-xs truncate"
                      style={{
                        borderRight: "1px solid var(--border)",
                        borderBottom: "1px solid var(--border)",
                        maxWidth: 300,
                        height: ROW_HEIGHT,
                        verticalAlign: "middle",
                        color: "var(--text-primary)",
                      }}
                      title={
                        cell.getValue() != null
                          ? String(cell.getValue())
                          : undefined
                      }
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}

            {paddingBottom > 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{ height: paddingBottom }}
                />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
