import { invoke } from "@tauri-apps/api/core";
import type { DbConnectionConfig, QueryResult, SchemaTable } from "../types";

export const api = {
  testConnection: (config: DbConnectionConfig, password: string) =>
    invoke<void>("test_connection", { config, password }),

  connectDb: (config: DbConnectionConfig, password: string) =>
    invoke<void>("connect_db", { config, password }),

  disconnectDb: (connectionId: string) =>
    invoke<void>("disconnect_db", { connectionId }),

  saveConnection: (config: DbConnectionConfig, password: string) =>
    invoke<void>("save_connection", { config, password }),

  loadConnections: () => invoke<DbConnectionConfig[]>("load_connections"),

  deleteConnection: (connectionId: string) =>
    invoke<void>("delete_connection", { connectionId }),

  getConnectionPassword: (connectionId: string) =>
    invoke<string>("get_connection_password", { connectionId }),

  executeQuery: (connectionId: string, sql: string) =>
    invoke<QueryResult>("execute_query", { connectionId, sql }),

  fetchSchema: (connectionId: string) =>
    invoke<SchemaTable[]>("fetch_schema", { connectionId }),
};
