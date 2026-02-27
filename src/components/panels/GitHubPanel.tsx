"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { BasePanel } from "@/components/panels/BasePanel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Github,
  GitCommit,
  GitPullRequest,
  CircleDot,
  Star,
  GitFork,
  Bell,
  Activity,
  BookMarked,
  Loader2,
  AlertCircle,
  LogIn,
  ExternalLink,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// ─── Types ──────────────────────────────────────────────────────

interface ContributionDay {
  contributionCount: number;
  date: string;
  color: string;
}

interface ContributionWeek {
  contributionDays: ContributionDay[];
}

interface ContributionCalendar {
  totalContributions: number;
  weeks: ContributionWeek[];
}

interface GitHubProfile {
  login: string;
  name: string | null;
  avatarUrl: string;
  bio: string | null;
  publicRepos: number;
  followers: number;
  following: number;
  url: string;
}

interface GitHubEvent {
  id: string;
  type: string;
  repo: string;
  description: string;
  createdAt: string;
}

interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  url: string;
  isPrivate: boolean;
  updatedAt: string;
  pushedAt: string;
}

interface GitHubNotification {
  id: string;
  reason: string;
  title: string;
  repo: string;
  url: string;
  updatedAt: string;
  unread: boolean;
  type: string;
}

type TabType = "activity" | "repos" | "notifications";

interface GitHubPanelProps {
  id: string;
  onRemove?: (id: string) => void;
  onToggleExpand?: (id: string) => void;
  isExpanded?: boolean;
}

// ─── Language Colors ────────────────────────────────────────────

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  Rust: "#dea584",
  Go: "#00ADD8",
  Java: "#b07219",
  "C++": "#f34b7d",
  C: "#555555",
  "C#": "#178600",
  Ruby: "#701516",
  PHP: "#4F5D95",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  Dart: "#00B4AB",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Shell: "#89e051",
  Lua: "#000080",
  Vim: "#199f4b",
  Zig: "#ec915c",
};

// ─── Contribution Graph Colors ──────────────────────────────────

const CONTRIBUTION_COLORS = [
  "#161b22", // 0 contributions (dark bg)
  "#0e4429",
  "#006d32",
  "#26a641",
  "#39d353",
];

function getContributionColor(count: number): string {
  if (count === 0) return CONTRIBUTION_COLORS[0];
  if (count <= 3) return CONTRIBUTION_COLORS[1];
  if (count <= 6) return CONTRIBUTION_COLORS[2];
  if (count <= 9) return CONTRIBUTION_COLORS[3];
  return CONTRIBUTION_COLORS[4];
}

// ─── Streak Calculator ──────────────────────────────────────────

function calculateStreak(calendar: ContributionCalendar): number {
  const allDays = calendar.weeks
    .flatMap((w) => w.contributionDays)
    .sort((a, b) => b.date.localeCompare(a.date)); // newest first

  let streak = 0;
  // Skip today if it has 0 contributions (day not over yet)
  const today = new Date().toISOString().split("T")[0];
  const startIdx = allDays[0]?.date === today && allDays[0].contributionCount === 0 ? 1 : 0;

  for (let i = startIdx; i < allDays.length; i++) {
    if (allDays[i].contributionCount > 0) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// ─── Event Icon ─────────────────────────────────────────────────

function getEventIcon(type: string) {
  switch (type) {
    case "PushEvent":
      return <GitCommit className="h-3.5 w-3.5 text-green-400" />;
    case "PullRequestEvent":
      return <GitPullRequest className="h-3.5 w-3.5 text-purple-400" />;
    case "IssuesEvent":
    case "IssueCommentEvent":
      return <CircleDot className="h-3.5 w-3.5 text-yellow-400" />;
    case "WatchEvent":
      return <Star className="h-3.5 w-3.5 text-yellow-300" />;
    case "ForkEvent":
      return <GitFork className="h-3.5 w-3.5 text-blue-400" />;
    case "CreateEvent":
    case "DeleteEvent":
      return <BookMarked className="h-3.5 w-3.5 text-cyan-400" />;
    default:
      return <Activity className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

// ─── Component ──────────────────────────────────────────────────

export function GitHubPanel({
  id,
  onRemove,
  onToggleExpand,
  isExpanded = false,
}: GitHubPanelProps) {
  // State
  const [activeTab, setActiveTab] = useState<TabType>("activity");
  const [calendar, setCalendar] = useState<ContributionCalendar | null>(null);
  const [profile, setProfile] = useState<GitHubProfile | null>(null);
  const [events, setEvents] = useState<GitHubEvent[]>([]);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [notifications, setNotifications] = useState<GitHubNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);

  // ─── Data Fetching ──────────────────────────────────────────

  const fetchContributions = useCallback(async () => {
    try {
      const res = await fetch("/api/github/contributions");
      if (res.status === 401) {
        setAuthError(true);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to fetch contributions");
      }
      const data = await res.json();
      setCalendar(data.calendar);
      setProfile(data.profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading contributions");
    }
  }, []);

  const fetchActivityData = useCallback(async () => {
    setTabLoading(true);
    try {
      const res = await fetch("/api/github/activity");
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch {
      // Silent fail for tab data
    } finally {
      setTabLoading(false);
    }
  }, []);

  const fetchReposData = useCallback(async () => {
    setTabLoading(true);
    try {
      const res = await fetch("/api/github/repos");
      if (res.ok) {
        const data = await res.json();
        setRepos(data);
      }
    } catch {
      // Silent fail
    } finally {
      setTabLoading(false);
    }
  }, []);

  const fetchNotificationsData = useCallback(async () => {
    setTabLoading(true);
    try {
      const res = await fetch("/api/github/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch {
      // Silent fail
    } finally {
      setTabLoading(false);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAuthError(false);
    await fetchContributions();
    await fetchActivityData();
    setLoading(false);
  }, [fetchContributions, fetchActivityData]);

  // ─── Effects ────────────────────────────────────────────────

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadAll]);

  useEffect(() => {
    if (activeTab === "activity" && events.length === 0) fetchActivityData();
    if (activeTab === "repos" && repos.length === 0) fetchReposData();
    if (activeTab === "notifications" && notifications.length === 0)
      fetchNotificationsData();
  }, [
    activeTab,
    events.length,
    repos.length,
    notifications.length,
    fetchActivityData,
    fetchReposData,
    fetchNotificationsData,
  ]);

  const unreadCount = notifications.filter((n) => n.unread).length;
  const streak = useMemo(
    () => (calendar ? calculateStreak(calendar) : 0),
    [calendar]
  );

  // ─── Render ─────────────────────────────────────────────────

  return (
    <BasePanel
      id={id}
      title={`GitHub${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
      icon={<Github className="h-4 w-4" />}
      isLoading={loading && !calendar}
      isExpanded={isExpanded}
      onRemove={onRemove}
      onToggleExpand={onToggleExpand}
      onRefresh={() => loadAll()}
    >
      {authError ? (
        <AuthPrompt />
      ) : error ? (
        <ErrorDisplay message={error} onRetry={loadAll} />
      ) : (
        <div className="flex flex-col gap-3 h-full">
          {/* Contribution Graph */}
          {calendar && (
            <ContributionGraph
              calendar={calendar}
              profile={profile}
              streak={streak}
            />
          )}

          {/* Tabs */}
          <div className="flex gap-1 border-b border-border pb-1">
            <TabButton
              active={activeTab === "activity"}
              onClick={() => setActiveTab("activity")}
              icon={<Activity className="h-3 w-3" />}
              label="Activity"
            />
            <TabButton
              active={activeTab === "repos"}
              onClick={() => setActiveTab("repos")}
              icon={<BookMarked className="h-3 w-3" />}
              label="Repos"
            />
            <TabButton
              active={activeTab === "notifications"}
              onClick={() => setActiveTab("notifications")}
              icon={<Bell className="h-3 w-3" />}
              label="Notifications"
              badge={unreadCount > 0 ? unreadCount : undefined}
            />
          </div>

          {/* Tab Content */}
          <ScrollArea className="flex-1">
            {tabLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : activeTab === "activity" ? (
              <ActivityList events={events} />
            ) : activeTab === "repos" ? (
              <RepoList repos={repos} />
            ) : (
              <NotificationList notifications={notifications} />
            )}
          </ScrollArea>
        </div>
      )}
    </BasePanel>
  );
}

// ─── Sub-Components ───────────────────────────────────────────────

function AuthPrompt() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
      <LogIn className="h-10 w-10 text-muted-foreground" />
      <div>
        <p className="text-sm font-medium">Sign in to access GitHub</p>
        <p className="text-xs text-muted-foreground mt-1">
          Connect your GitHub account to view activity and contributions
        </p>
      </div>
      <Button
        size="sm"
        onClick={() => (window.location.href = "/api/auth/signin")}
      >
        <Github className="h-4 w-4 mr-2" />
        Sign in with GitHub
      </Button>
    </div>
  );
}

function ErrorDisplay({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
      <AlertCircle className="h-8 w-8 text-destructive" />
      <p className="text-sm text-destructive">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors relative ${
        active
          ? "text-foreground bg-muted border-b-2 border-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      }`}
    >
      {icon}
      {label}
      {badge !== undefined && (
        <span className="ml-1 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
          {badge}
        </span>
      )}
    </button>
  );
}

// ─── Contribution Graph ─────────────────────────────────────────

function ContributionGraph({
  calendar,
  profile,
  streak,
}: {
  calendar: ContributionCalendar;
  profile: GitHubProfile | null;
  streak: number;
}) {
  // Show last 20 weeks to fit panel width nicely
  const visibleWeeks = calendar.weeks.slice(-20);
  const cellSize = 10;
  const cellGap = 2;
  const totalW = visibleWeeks.length * (cellSize + cellGap);
  const totalH = 7 * (cellSize + cellGap);

  return (
    <div className="flex flex-col gap-2">
      {/* Stats row */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <div className="flex items-center gap-3">
          {profile && (
            <span className="font-medium text-foreground">
              @{profile.login}
            </span>
          )}
          <span>{calendar.totalContributions.toLocaleString()} contributions</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-orange-400">🔥</span>
          <span>{streak} day streak</span>
        </div>
      </div>

      {/* Graph */}
      <div className="overflow-x-auto">
        <svg
          width={totalW}
          height={totalH}
          className="block"
          role="img"
          aria-label="Contribution graph"
        >
          {visibleWeeks.map((week, wi) =>
            week.contributionDays.map((day, di) => (
              <rect
                key={`${wi}-${di}`}
                x={wi * (cellSize + cellGap)}
                y={di * (cellSize + cellGap)}
                width={cellSize}
                height={cellSize}
                rx={2}
                fill={getContributionColor(day.contributionCount)}
                className="transition-opacity hover:opacity-80"
              >
                <title>
                  {day.date}: {day.contributionCount} contribution
                  {day.contributionCount !== 1 ? "s" : ""}
                </title>
              </rect>
            ))
          )}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground justify-end">
        <span>Less</span>
        {CONTRIBUTION_COLORS.map((color, i) => (
          <div
            key={i}
            className="w-[10px] h-[10px] rounded-sm"
            style={{ backgroundColor: color }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

// ─── Activity List ──────────────────────────────────────────────

function ActivityList({ events }: { events: GitHubEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-8">
        <Activity className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
        No recent activity
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {events.map((event) => (
        <div
          key={event.id}
          className="flex items-start gap-2.5 p-2 rounded-md hover:bg-muted/50 transition-colors"
        >
          <div className="mt-0.5 shrink-0">{getEventIcon(event.type)}</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground truncate">
              {event.repo}
            </p>
            <p className="text-xs text-foreground line-clamp-2">
              {event.description}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {formatTimestamp(event.createdAt)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Repo List ──────────────────────────────────────────────────

function RepoList({ repos }: { repos: GitHubRepo[] }) {
  if (repos.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-8">
        <BookMarked className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
        No repositories found
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {repos.map((repo) => (
        <a
          key={repo.id}
          href={repo.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col gap-1 p-2 rounded-md hover:bg-muted/50 transition-colors group"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground group-hover:text-primary truncate">
              {repo.name}
            </span>
            {repo.isPrivate && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                Private
              </Badge>
            )}
            <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-auto" />
          </div>
          {repo.description && (
            <p className="text-[11px] text-muted-foreground line-clamp-1">
              {repo.description}
            </p>
          )}
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            {repo.language && (
              <span className="flex items-center gap-1">
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{
                    backgroundColor:
                      LANGUAGE_COLORS[repo.language] || "#8b8b8b",
                  }}
                />
                {repo.language}
              </span>
            )}
            {repo.stars > 0 && (
              <span className="flex items-center gap-0.5">
                <Star className="h-2.5 w-2.5" />
                {repo.stars.toLocaleString()}
              </span>
            )}
            {repo.forks > 0 && (
              <span className="flex items-center gap-0.5">
                <GitFork className="h-2.5 w-2.5" />
                {repo.forks.toLocaleString()}
              </span>
            )}
            <span className="ml-auto">{formatTimestamp(repo.updatedAt)}</span>
          </div>
        </a>
      ))}
    </div>
  );
}

// ─── Notification List ──────────────────────────────────────────

function NotificationList({
  notifications,
}: {
  notifications: GitHubNotification[];
}) {
  if (notifications.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-8">
        <Bell className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
        No notifications
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className="flex items-start gap-2.5 p-2 rounded-md hover:bg-muted/50 transition-colors"
        >
          {notification.unread && (
            <span className="mt-1.5 w-2 h-2 rounded-full bg-primary shrink-0" />
          )}
          {!notification.unread && <span className="w-2 shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground truncate">
              {notification.repo}
            </p>
            <p className="text-xs text-foreground line-clamp-2">
              {notification.title}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge
                variant="outline"
                className="text-[9px] px-1.5 py-0 h-4 capitalize"
              >
                {notification.reason.replace(/_/g, " ")}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                {formatTimestamp(notification.updatedAt)}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────

function formatTimestamp(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return dateStr;
  }
}
