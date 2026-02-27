"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { BasePanel } from "@/components/panels/BasePanel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Newspaper,
  ExternalLink,
  RefreshCw,
  Clock,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  description: string;
  category: string;
  imageUrl?: string;
}

interface NewsPanelProps {
  id: string;
  defaultCategory?: string;
}

// ─── Tab definitions ────────────────────────────────────────────

interface TabDef {
  label: string;
  filter: string | null; // null = show all
}

const TABS: TabDef[] = [
  { label: "All", filter: null },
  { label: "News", filter: "news" }, // matches general + world
  { label: "Tech", filter: "tech" },
];

// Map tab filter to actual categories from seed data
function matchesTab(item: NewsItem, filter: string | null): boolean {
  if (!filter) return true;
  if (filter === "news") return item.category === "general" || item.category === "world";
  return item.category === filter;
}

// ─── Helpers ────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return "just now";

  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(dateStr).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function formatLastFetch(date: Date): string {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// ─── Source color map ───────────────────────────────────────────

const SOURCE_COLORS: Record<string, string> = {
  "AP News": "bg-red-500/15 text-red-600 dark:text-red-400",
  Reuters: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  "BBC World": "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  "NPR News": "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  "The Guardian": "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  "Al Jazeera": "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  TechCrunch: "bg-green-500/15 text-green-600 dark:text-green-400",
  "Hacker News": "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  "The Verge": "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  "Ars Technica": "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
};

function getSourceColor(name: string): string {
  return SOURCE_COLORS[name] || "bg-primary/10 text-primary";
}

// ─── Source Favicon ─────────────────────────────────────────────

function SourceBadge({ name }: { name: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none whitespace-nowrap",
        getSourceColor(name)
      )}
    >
      {name}
    </span>
  );
}

// ─── Article Card ───────────────────────────────────────────────

function ArticleCard({ item }: { item: NewsItem }) {
  const firstLine = item.description?.split("\n")[0]?.trim() || "";

  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      title={item.title}
      className="group block rounded-lg border p-3 transition-colors hover:bg-accent/50"
    >
      <div className="flex items-start gap-3">
        {/* Text content */}
        <div className="min-w-0 flex-1 space-y-1">
          {/* Source + time row */}
          <div className="flex items-center gap-2">
            <SourceBadge name={item.source} />
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" />
              {relativeTime(item.pubDate)}
            </span>
          </div>

          {/* Headline */}
          <h3 className="text-sm font-semibold leading-snug line-clamp-2 group-hover:underline">
            {item.title}
          </h3>

          {/* Description first line */}
          {firstLine && (
            <p className="text-xs text-muted-foreground line-clamp-1">
              {firstLine}
            </p>
          )}
        </div>

        {/* Thumbnail (if available) */}
        {item.imageUrl && (
          /* eslint-disable @next/next/no-img-element */
          <img
            src={item.imageUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-md object-cover"
            loading="lazy"
          />
          /* eslint-enable @next/next/no-img-element */
        )}

        {/* External link indicator */}
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5" />
      </div>
    </a>
  );
}

// ─── Tab Bar ────────────────────────────────────────────────────

function TabBar({
  tabs,
  activeIndex,
  onChange,
}: {
  tabs: TabDef[];
  activeIndex: number;
  onChange: (i: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {tabs.map((tab, i) => (
        <button
          key={tab.label}
          onClick={() => onChange(i)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            i === activeIndex
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ─── Main NewsPanel ─────────────────────────────────────────────

export function NewsPanel({ id, defaultCategory = "all" }: NewsPanelProps) {
  const [allArticles, setAllArticles] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Set initial tab based on defaultCategory prop
  useEffect(() => {
    if (defaultCategory !== "all") {
      const idx = TABS.findIndex((t) => t.filter === defaultCategory);
      if (idx >= 0) setActiveTab(idx);
    }
  }, [defaultCategory]);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/news");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to fetch news");
      }
      const data = await res.json();
      setAllArticles(data.articles ?? []);
      setLastFetch(new Date(data.fetchedAt || Date.now()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error fetching news");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();

    // Auto-refresh every 15 minutes
    intervalRef.current = setInterval(fetchNews, 15 * 60 * 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchNews]);

  // Client-side filter by tab
  const filtered = allArticles.filter((item) =>
    matchesTab(item, TABS[activeTab]?.filter ?? null)
  );

  return (
    <BasePanel
      id={id}
      title="News"
      icon={<Newspaper className="h-4 w-4" />}
      isLoading={loading}
      onRefresh={fetchNews}
      headerActions={
        <TabBar tabs={TABS} activeIndex={activeTab} onChange={setActiveTab} />
      }
    >
      <div className="flex flex-col gap-2 h-full">
        {/* Auto-refresh indicator */}
        {lastFetch && !loading && (
          <div className="flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground">
            <RefreshCw className="h-2.5 w-2.5" />
            Updated {formatLastFetch(lastFetch)}
            <span className="ml-auto">{filtered.length} articles</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        <Separator />

        {/* Articles */}
        <div className="flex-1 min-h-0">
          {loading && allArticles.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Fetching latest news…
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
              <Newspaper className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">
                No articles found for this category.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[320px]">
              <div className="flex flex-col gap-2 pr-2">
                {filtered.map((item, i) => (
                  <ArticleCard key={`${item.link}-${i}`} item={item} />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </BasePanel>
  );
}
