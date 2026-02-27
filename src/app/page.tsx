"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { DashboardGrid, DashboardPanel } from "@/components/layout/DashboardGrid";
import { WeatherPanel } from "@/components/panels/WeatherPanel";
import { NewsPanel } from "@/components/panels/NewsPanel";
import { GmailPanel } from "@/components/panels/GmailPanel";
import { GitHubPanel } from "@/components/panels/GitHubPanel";
import { SpotifyPanel } from "@/components/panels/SpotifyPanel";
import { YouTubePanel } from "@/components/panels/YouTubePanel";
import { CalendarPanel } from "@/components/panels/CalendarPanel";
import { TeamsPanel } from "@/components/panels/TeamsPanel";
import { MeetPanel } from "@/components/panels/MeetPanel";
import { InstagramPanel } from "@/components/panels/InstagramPanel";
import { AppleMusicPanel } from "@/components/panels/AppleMusicPanel";

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
  {
    id: "gmail-1",
    type: "gmail",
    title: "Gmail",
    defaultLayout: { x: 0, y: 5, w: 6, h: 6, minW: 4, minH: 5 },
    component: (
      <GmailPanel
        id="gmail-1"
      />
    ),
  },
  {
    id: "github-1",
    type: "github",
    title: "GitHub",
    defaultLayout: { x: 6, y: 5, w: 6, h: 6, minW: 4, minH: 5 },
    component: (
      <GitHubPanel
        id="github-1"
      />
    ),
  },
  {
    id: "spotify-1",
    type: "spotify",
    title: "Spotify",
    defaultLayout: { x: 0, y: 11, w: 6, h: 6, minW: 4, minH: 5 },
    component: (
      <SpotifyPanel
        id="spotify-1"
      />
    ),
  },
  {
    id: "youtube-1",
    type: "youtube",
    title: "YouTube",
    defaultLayout: { x: 6, y: 11, w: 6, h: 8, minW: 4, minH: 6 },
    component: (
      <YouTubePanel
        id="youtube-1"
      />
    ),
  },
  {
    id: "calendar-1",
    type: "calendar",
    title: "Calendar",
    defaultLayout: { x: 0, y: 19, w: 6, h: 6, minW: 4, minH: 5 },
    component: (
      <CalendarPanel
        id="calendar-1"
      />
    ),
  },
  {
    id: "teams-1",
    type: "teams",
    title: "Teams",
    defaultLayout: { x: 6, y: 19, w: 6, h: 6, minW: 4, minH: 5 },
    component: (
      <TeamsPanel
        id="teams-1"
      />
    ),
  },
  {
    id: "meet-1",
    type: "meet",
    title: "Meet",
    defaultLayout: { x: 0, y: 25, w: 6, h: 6, minW: 4, minH: 5 },
    component: (
      <MeetPanel
        id="meet-1"
      />
    ),
  },
  {
    id: "instagram-1",
    type: "instagram",
    title: "Instagram",
    defaultLayout: { x: 6, y: 25, w: 6, h: 7, minW: 4, minH: 5 },
    component: (
      <InstagramPanel
        id="instagram-1"
      />
    ),
  },
  {
    id: "apple-music-1",
    type: "apple-music",
    title: "Apple Music",
    defaultLayout: { x: 0, y: 32, w: 6, h: 5, minW: 3, minH: 4 },
    component: (
      <AppleMusicPanel
        id="apple-music-1"
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
