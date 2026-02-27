"use client";

import React, { useMemo } from "react";
import {
  useContainerWidth,
  ResponsiveGridLayout,
  Layout,
  LayoutItem,
  ResponsiveLayouts,
  verticalCompactor,
} from "react-grid-layout";
import "react-grid-layout/css/styles.css";

export interface DashboardPanel {
  id: string;
  type: string;
  title: string;
  component: React.ReactNode;
  defaultLayout?: {
    x: number;
    y: number;
    w: number;
    h: number;
    minW?: number;
    minH?: number;
    maxW?: number;
    maxH?: number;
  };
}

interface DashboardGridProps {
  panels: DashboardPanel[];
  onLayoutChange?: (layout: Layout, layouts: ResponsiveLayouts) => void;
  className?: string;
}

const defaultBreakpoints = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };
const defaultCols = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };

export function DashboardGrid({
  panels,
  onLayoutChange,
  className,
}: DashboardGridProps) {
  const { width, containerRef, mounted } = useContainerWidth();

  const initialLayouts = useMemo<ResponsiveLayouts>(() => {
    const lg: LayoutItem[] = panels.map((panel, index) => ({
      i: panel.id,
      x: panel.defaultLayout?.x ?? (index % 3) * 4,
      y: panel.defaultLayout?.y ?? Math.floor(index / 3) * 4,
      w: panel.defaultLayout?.w ?? 4,
      h: panel.defaultLayout?.h ?? 4,
      minW: panel.defaultLayout?.minW ?? 2,
      minH: panel.defaultLayout?.minH ?? 2,
    }));
    return { lg };
  }, [panels]);

  return (
    <div ref={containerRef as React.RefObject<HTMLDivElement>} className={className}>
      {mounted && (
        <ResponsiveGridLayout
          width={width}
          layouts={initialLayouts}
          breakpoints={defaultBreakpoints}
          cols={defaultCols}
          rowHeight={80}
          dragConfig={{ handle: ".drag-handle" }}
          compactor={verticalCompactor}
          margin={[16, 16] as const}
          onLayoutChange={onLayoutChange}
        >
          {panels.map((panel) => (
            <div key={panel.id} className="overflow-hidden">
              {panel.component}
            </div>
          ))}
        </ResponsiveGridLayout>
      )}
    </div>
  );
}
