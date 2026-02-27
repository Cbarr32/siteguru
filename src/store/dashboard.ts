import { create } from "zustand";
import type { ResponsiveLayouts } from "react-grid-layout";

export interface PanelConfig {
  id: string;
  type: string;
  title: string;
  config: Record<string, unknown>;
  visible: boolean;
}

interface DashboardState {
  panels: PanelConfig[];
  layouts: ResponsiveLayouts;
  sidebarCollapsed: boolean;

  // Actions
  addPanel: (panel: PanelConfig) => void;
  removePanel: (id: string) => void;
  updatePanel: (id: string, updates: Partial<PanelConfig>) => void;
  setLayouts: (layouts: ResponsiveLayouts) => void;
  toggleSidebar: () => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  panels: [],
  layouts: {},
  sidebarCollapsed: false,

  addPanel: (panel) =>
    set((state) => ({
      panels: [...state.panels, panel],
    })),

  removePanel: (id) =>
    set((state) => ({
      panels: state.panels.filter((p) => p.id !== id),
    })),

  updatePanel: (id, updates) =>
    set((state) => ({
      panels: state.panels.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    })),

  setLayouts: (layouts) => set({ layouts }),

  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));
