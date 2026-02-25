import { useRef, useMemo, useState } from "react";
import { X, Copy, Check, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import type { QueryResult } from "../../types";

interface Props {
  result: QueryResult;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

const ROW_HEIGHT = 28;
const PAGE_SIZES = [50, 100, 500, 1000];

export function DataTable({ result, page, pageSize, onPageChange, onPageSizeChange }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [copied, setCopied] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const rowNumberColumn = useMemo<ColumnDef<Record<string, unknown>>>(
    () => ({
      id: "__row_num__",
      header: "#",
      size: 52,
      enableSorting: false,
      cell: ({ row }) => (
        <span style={{ color: "var(--text-muted)" }}>
          {page * pageSize + row.index + 1}
        </span>
      ),
    }),
    [page, pageSize]
  );

  const dataColumns = useMemo<ColumnDef<Record<string, unknown>>[]>(
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

  const columns = useMemo(
    () => [rowNumberColumn, ...dataColumns],
    [rowNumberColumn, dataColumns]
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

  const copyAsText = async () => {
    const headers = result.columns.join("\t");
    const body = rows
      .map((row) =>
        result.columns
          .map((col) => {
            const v = row.original[col];
            return v === null || v === undefined ? "" : String(v);
          })
          .join("\t")
      )
      .join("\n");
    await navigator.clipboard.writeText(headers + "\n" + body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const totalRows = result.total_rows;
  const pageCount = totalRows !== null ? Math.max(1, Math.ceil(totalRows / pageSize)) : null;
  const showPagination = totalRows !== null;
  const canPrev = page > 0;
  const canNext = pageCount !== null ? page < pageCount - 1 : rows.length === pageSize;

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
        <div className="relative flex items-center">
          <input
            type="text"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Filter page…"
            className="w-48 px-2 py-0.5 rounded text-xs outline-none"
            style={{
              background: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              paddingRight: globalFilter ? "1.25rem" : undefined,
            }}
          />
          {globalFilter && (
            <button
              onClick={() => setGlobalFilter("")}
              className="absolute right-1.5 flex items-center justify-center"
              style={{ color: "var(--text-muted)" }}
              title="Clear filter"
            >
              <X size={11} />
            </button>
          )}
        </div>
        <button
          onClick={copyAsText}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-xs"
          style={{
            background: copied ? "var(--bg-tertiary)" : "transparent",
            color: copied ? "var(--success)" : "var(--text-muted)",
            border: "1px solid var(--border)",
          }}
          title="Copy visible rows as tab-separated values"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? "Copied" : "Copy"}
        </button>
        <span
          className="text-xs ml-auto"
          style={{ color: "var(--text-muted)" }}
        >
          {totalRows !== null
            ? `${totalRows.toLocaleString()} row${totalRows !== 1 ? "s" : ""} total`
            : `${rows.length.toLocaleString()} row${rows.length !== 1 ? "s" : ""}`}
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
                      color: header.id === "__row_num__" ? "var(--text-muted)" : "var(--text-secondary)",
                      borderRight: "1px solid var(--border)",
                      borderBottom: "1px solid var(--border)",
                      cursor: header.column.getCanSort() ? "pointer" : "default",
                      whiteSpace: "nowrap",
                      width: header.getSize(),
                      textAlign: header.id === "__row_num__" ? "right" : "left",
                    }}
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                    {header.column.getIsSorted() && (
                      <ArrowUp
                        size={10}
                        style={{
                          display: "inline-block",
                          marginLeft: 4,
                          verticalAlign: "middle",
                          flexShrink: 0,
                          transform:
                            header.column.getIsSorted() === "desc"
                              ? "rotate(180deg)"
                              : "none",
                        }}
                      />
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.id}
                style={{
                  height: ROW_HEIGHT,
                  background:
                    i % 2 === 0
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
                      maxWidth: cell.column.id === "__row_num__" ? 52 : 300,
                      height: ROW_HEIGHT,
                      verticalAlign: "middle",
                      color: "var(--text-primary)",
                      textAlign: cell.column.id === "__row_num__" ? "right" : "left",
                    }}
                    title={
                      cell.column.id !== "__row_num__" && cell.getValue() != null
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
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination bar */}
      {showPagination && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 shrink-0 text-xs"
          style={{
            borderTop: "1px solid var(--border)",
            color: "var(--text-muted)",
          }}
        >
          <button
            onClick={() => onPageChange(0)}
            disabled={!canPrev}
            className="px-1.5 py-0.5 rounded disabled:opacity-30"
            style={{
              border: "1px solid var(--border)",
              cursor: canPrev ? "pointer" : "default",
            }}
            title="First page"
          >
            «
          </button>
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={!canPrev}
            className="flex items-center px-1 py-0.5 rounded disabled:opacity-30"
            style={{
              border: "1px solid var(--border)",
              cursor: canPrev ? "pointer" : "default",
            }}
            title="Previous page"
          >
            <ChevronLeft size={12} />
          </button>

          <span>
            Page{" "}
            <strong style={{ color: "var(--text-primary)" }}>{page + 1}</strong>
            {pageCount !== null && (
              <>
                {" "}of{" "}
                <strong style={{ color: "var(--text-primary)" }}>
                  {pageCount.toLocaleString()}
                </strong>
              </>
            )}
          </span>

          <button
            onClick={() => onPageChange(page + 1)}
            disabled={!canNext}
            className="flex items-center px-1 py-0.5 rounded disabled:opacity-30"
            style={{
              border: "1px solid var(--border)",
              cursor: canNext ? "pointer" : "default",
            }}
            title="Next page"
          >
            <ChevronRight size={12} />
          </button>
          {pageCount !== null && (
            <button
              onClick={() => onPageChange(pageCount - 1)}
              disabled={!canNext}
              className="px-1.5 py-0.5 rounded disabled:opacity-30"
              style={{
                border: "1px solid var(--border)",
                cursor: canNext ? "pointer" : "default",
              }}
              title="Last page"
            >
              »
            </button>
          )}

          <span className="ml-auto flex items-center gap-1.5">
            Rows per page:
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="rounded px-1 py-0.5 text-xs outline-none"
              style={{
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                cursor: "pointer",
              }}
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s.toLocaleString()}
                </option>
              ))}
            </select>
          </span>
        </div>
      )}
    </div>
  );
}
