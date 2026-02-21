import { create } from "zustand";
import type { QueryResult, Tab } from "../types";

interface TabStore {
  tabs: Tab[];
  activeTabId: string | null;

  openTab: (connectionId: string, connectionName: string, sql?: string, label?: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  setTabSql: (tabId: string, sql: string) => void;
  setTabResult: (tabId: string, result: QueryResult) => void;
  setTabLoading: (tabId: string, isLoading: boolean) => void;
  setTabError: (tabId: string, error: string | null) => void;
}

export const useTabStore = create<TabStore>((set) => ({
  tabs: [],
  activeTabId: null,

  openTab: (connectionId, connectionName, sql, label) => {
    const id = crypto.randomUUID();
    const tab: Tab = {
      id,
      connectionId,
      label: label ?? connectionName,
      sql: sql ?? "SELECT 1;",
      result: null,
      isLoading: false,
      error: null,
      autoRun: sql !== undefined,
    };
    set((state) => ({ tabs: [...state.tabs, tab], activeTabId: id }));
  },

  closeTab: (tabId) => {
    set((state) => {
      const tabs = state.tabs.filter((t) => t.id !== tabId);
      let activeTabId = state.activeTabId;
      if (activeTabId === tabId) {
        const idx = state.tabs.findIndex((t) => t.id === tabId);
        activeTabId = tabs[Math.max(0, idx - 1)]?.id ?? null;
      }
      return { tabs, activeTabId };
    });
  },

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  setTabSql: (tabId, sql) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, sql } : t)),
    })),

  setTabResult: (tabId, result) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, result, error: null, isLoading: false } : t
      ),
    })),

  setTabLoading: (tabId, isLoading) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, isLoading } : t)),
    })),

  setTabError: (tabId, error) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, error, isLoading: false } : t
      ),
    })),
}));
