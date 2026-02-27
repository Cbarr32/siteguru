"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { DashboardGrid, DashboardPanel } from "@/components/layout/DashboardGrid";
import { WeatherPanel } from "@/components/panels/WeatherPanel";
import { NewsPanel } from "@/components/panels/NewsPanel";

const defaultPanels: DashboardPanel[] = [
  {
    id: "weather-1",
    type: "weather",
    title: "Weather",
    defaultLayout: { x: 0, y: 0, w: 4, h: 5, minW: 3, minH: 4 },
    component: (
      <WeatherPanel
        id="weather-1"
        defaultCity="New York"
      />
    ),
  },
  {
    id: "news-1",
    type: "news",
    title: "News",
    defaultLayout: { x: 4, y: 0, w: 8, h: 5, minW: 4, minH: 4 },
    component: (
      <NewsPanel
        id="news-1"
        defaultCategory="all"
      />
    ),
  },
];

export default function DashboardPage() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-muted/30 p-4">
        <div className="mb-4">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Welcome to SiteGuru — your personal dashboard
          </p>
        </div>
        <DashboardGrid panels={defaultPanels} />
      </main>
    </div>
  );
}
