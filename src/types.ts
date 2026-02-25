export interface DbConnectionConfig {
  id: string;
  name: string;
  driver: "postgres" | "mysql" | "sqlite";
  host?: string;
  port?: number;
  database?: string;
  username?: string;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rows_affected: number | null;
  execution_time_ms: number;
  truncated: boolean;
  total_rows: number | null;
}

export interface SchemaColumn {
  column_name: string;
  data_type: string;
  is_nullable: boolean;
}

export interface SchemaTable {
  table_name: string;
  table_type: "table" | "view";
  columns: SchemaColumn[];
}

export interface Tab {
  id: string;
  connectionId: string;
  label: string;
  sql: string;
  result: QueryResult | null;
  isLoading: boolean;
  error: string | null;
  autoRun?: boolean;
  page: number;
  pageSize: number;
  paginationSql: string | null;
}
