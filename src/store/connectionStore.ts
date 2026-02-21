import { create } from "zustand";
import { api } from "../lib/invoke";
import type { DbConnectionConfig, SchemaTable } from "../types";

interface ConnectionStore {
  savedConnections: DbConnectionConfig[];
  activeConnectionIds: Set<string>;
  schemaMap: Record<string, SchemaTable[]>;

  loadConnections: () => Promise<void>;
  saveConnection: (config: DbConnectionConfig, password: string) => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;

  connectTo: (id: string, password: string) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
  loadSchema: (id: string) => Promise<void>;

  isConnected: (id: string) => boolean;
}

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  savedConnections: [],
  activeConnectionIds: new Set(),
  schemaMap: {},

  loadConnections: async () => {
    const connections = await api.loadConnections();
    set({ savedConnections: connections });
  },

  saveConnection: async (config, password) => {
    await api.saveConnection(config, password);
    await get().loadConnections();
  },

  deleteConnection: async (id) => {
    await api.deleteConnection(id);
    set((state) => {
      const next = new Set(state.activeConnectionIds);
      next.delete(id);
      const { [id]: _, ...rest } = state.schemaMap;
      return {
        savedConnections: state.savedConnections.filter((c) => c.id !== id),
        activeConnectionIds: next,
        schemaMap: rest,
      };
    });
  },

  connectTo: async (id, password) => {
    const config = get().savedConnections.find((c) => c.id === id);
    if (!config) throw new Error("Connection not found");
    await api.connectDb(config, password);
    set((state) => ({
      activeConnectionIds: new Set([...state.activeConnectionIds, id]),
    }));
    // Load schema in the background
    get().loadSchema(id).catch(console.error);
  },

  disconnect: async (id) => {
    await api.disconnectDb(id);
    set((state) => {
      const next = new Set(state.activeConnectionIds);
      next.delete(id);
      const { [id]: _, ...rest } = state.schemaMap;
      return { activeConnectionIds: next, schemaMap: rest };
    });
  },

  loadSchema: async (id) => {
    const tables = await api.fetchSchema(id);
    set((state) => ({
      schemaMap: { ...state.schemaMap, [id]: tables },
    }));
  },

  isConnected: (id) => get().activeConnectionIds.has(id),
}));
