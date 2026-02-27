"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { BasePanel } from "./BasePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Youtube,
  Search,
  ListVideo,
  Rss,
  Clock,
  Play,
  Eye,
  AlertCircle,
  LogIn,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

interface YouTubePanelProps {
  id: string;
}

interface YouTubeThumbnails {
  default?: { url: string; width: number; height: number };
  medium?: { url: string; width: number; height: number };
  high?: { url: string; width: number; height: number };
}

interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  thumbnails: YouTubeThumbnails;
  publishedAt: string;
  viewCount: string | null;
  likeCount: string | null;
  duration: string | null;
}

interface YouTubePlaylist {
  id: string;
  title: string;
  description: string;
  thumbnails: YouTubeThumbnails;
  channelTitle: string;
  itemCount: number;
  publishedAt: string;
}

type TabKey = "search" | "subscriptions" | "playlists" | "watchlater";

// ─── Helpers ────────────────────────────────────────────────────

function formatViewCount(count: string | null): string {
  if (!count) return "";
  const n = parseInt(count, 10);
  if (isNaN(n)) return count;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K views`;
  return `${n} views`;
}

function formatRelativeDate(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

function parseDuration(iso: string | null): string {
  if (!iso) return "";
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "";
  const h = match[1] ? `${match[1]}:` : "";
  const m = match[2] || "0";
  const s = (match[3] || "0").padStart(2, "0");
  if (h) return `${h}${m.padStart(2, "0")}:${s}`;
  return `${m}:${s}`;
}

// ─── YouTube IFrame Player Hook ─────────────────────────────────

interface YTPlayerState {
  ready: boolean;
  playing: boolean;
  videoId: string | null;
}

function useYouTubePlayer(containerId: string) {
  const playerRef = useRef<YT.Player | null>(null);
  const [state, setState] = useState<YTPlayerState>({
    ready: false,
    playing: false,
    videoId: null,
  });
  const containerIdRef = useRef(containerId);
  containerIdRef.current = containerId;

  useEffect(() => {
    let mounted = true;

    function initPlayer() {
      if (!mounted) return;
      try {
        const player = new YT.Player(containerIdRef.current, {
          height: "100%",
          width: "100%",
          playerVars: {
            autoplay: 0,
            modestbranding: 1,
            rel: 0,
            fs: 1,
            playsinline: 1,
          },
          events: {
            onReady: () => {
              if (mounted) setState((p) => ({ ...p, ready: true }));
            },
            onStateChange: (event: YT.OnStateChangeEvent) => {
              if (!mounted) return;
              const isPlaying = event.data === YT.PlayerState.PLAYING;
              setState((p) => ({ ...p, playing: isPlaying }));
            },
            onError: (event: YT.OnErrorEvent) => {
              console.error("YouTube player error:", event.data);
            },
          },
        });
        playerRef.current = player;
      } catch (err) {
        console.error("Failed to init YT player:", err);
      }
    }

    // Check if YT is already available
    if (typeof YT !== "undefined" && YT.Player) {
      initPlayer();
    } else {
      // Load the IFrame API
      const existingScript = document.getElementById("youtube-iframe-api");
      if (!existingScript) {
        const script = document.createElement("script");
        script.id = "youtube-iframe-api";
        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;
        document.body.appendChild(script);
      }

      // Register global callback
      const prevCallback = (window as unknown as Record<string, unknown>)
        .onYouTubeIframeAPIReady as (() => void) | undefined;

      (window as unknown as Record<string, unknown>).onYouTubeIframeAPIReady = () => {
        prevCallback?.();
        initPlayer();
      };
    }

    return () => {
      mounted = false;
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // already destroyed
        }
        playerRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadVideo = useCallback((videoId: string) => {
    setState((p) => ({ ...p, videoId }));
    if (playerRef.current) {
      try {
        playerRef.current.loadVideoById(videoId);
      } catch {
        // player not ready yet
      }
    }
  }, []);

  return { ...state, loadVideo };
}

// ─── Video List Item ────────────────────────────────────────────

function VideoItem({
  video,
  onSelect,
  isActive,
}: {
  video: YouTubeVideo;
  onSelect: (id: string) => void;
  isActive: boolean;
}) {
  const thumb =
    video.thumbnails.medium?.url ||
    video.thumbnails.high?.url ||
    video.thumbnails.default?.url ||
    "";

  return (
    <button
      onClick={() => onSelect(video.id)}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/50",
        isActive && "bg-muted"
      )}
    >
      {/* Thumbnail */}
      <div className="relative shrink-0 w-28 aspect-video rounded overflow-hidden bg-muted">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Youtube className="h-5 w-5 text-muted-foreground/50" />
          </div>
        )}
        {video.duration && (
          <span className="absolute bottom-0.5 right-0.5 rounded bg-black/80 px-1 py-0.5 text-[10px] font-medium text-white">
            {parseDuration(video.duration)}
          </span>
        )}
        {isActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Play className="h-5 w-5 text-white fill-white" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-xs font-medium leading-tight">
          {video.title}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {video.channelTitle}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {video.viewCount && (
            <span className="flex items-center gap-0.5">
              <Eye className="h-2.5 w-2.5" />
              {formatViewCount(video.viewCount)}
            </span>
          )}
          {video.publishedAt && (
            <span>{formatRelativeDate(video.publishedAt)}</span>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Search Tab ─────────────────────────────────────────────────

function SearchTab({
  onSelect,
  activeVideoId,
}: {
  onSelect: (id: string) => void;
  activeVideoId: string | null;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YouTubeVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(
        `/api/youtube/search?q=${encodeURIComponent(q)}&maxResults=15`
      );
      if (!res.ok) return;
      const data = await res.json();
      setResults(data.videos ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 500);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      search(query);
    }
  };

  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Search YouTube..."
          className="h-8 pl-7 text-sm"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : results.length > 0 ? (
        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-0.5 pr-2">
            {results.map((video) => (
              <VideoItem
                key={video.id}
                video={video}
                onSelect={onSelect}
                isActive={activeVideoId === video.id}
              />
            ))}
          </div>
        </ScrollArea>
      ) : searched ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <Search className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground">
            No results for &ldquo;{query}&rdquo;
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <Search className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground">
            Search for videos on YouTube
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Subscriptions Tab ──────────────────────────────────────────

function SubscriptionsTab({
  onSelect,
  activeVideoId,
}: {
  onSelect: (id: string) => void;
  activeVideoId: string | null;
}) {
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch("/api/youtube/subscriptions");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to load");
        }
        const data = await res.json();
        if (mounted) setVideos(data.videos ?? []);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Error");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <AlertCircle className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <Rss className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">
          No recent subscription videos
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-0.5 pr-2">
        {videos.map((video) => (
          <VideoItem
            key={video.id}
            video={video}
            onSelect={onSelect}
            isActive={activeVideoId === video.id}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

// ─── Playlists Tab ──────────────────────────────────────────────

function PlaylistsTab() {
  const [playlists, setPlaylists] = useState<YouTubePlaylist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch("/api/youtube/playlists");
        if (!res.ok) return;
        const data = await res.json();
        if (mounted) setPlaylists(data.playlists ?? []);
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (playlists.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <ListVideo className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">No playlists found</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 pr-2">
        {playlists.map((pl) => {
          const thumb =
            pl.thumbnails.medium?.url ||
            pl.thumbnails.default?.url ||
            "";

          return (
            <a
              key={pl.id}
              href={`https://www.youtube.com/playlist?list=${pl.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50 group"
            >
              <div className="relative shrink-0 w-20 aspect-video rounded overflow-hidden bg-muted">
                {thumb ? (
                  <img
                    src={thumb}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ListVideo className="h-4 w-4 text-muted-foreground/50" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{pl.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {pl.itemCount} videos · {pl.channelTitle}
                </p>
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
            </a>
          );
        })}
      </div>
    </ScrollArea>
  );
}

// ─── Watch Later Tab ────────────────────────────────────────────

function WatchLaterTab({
  onSelect,
  activeVideoId,
}: {
  onSelect: (id: string) => void;
  activeVideoId: string | null;
}) {
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        // Uses subscriptions endpoint with a watchlater query param — or we
        // use the playlists endpoint for liked videos (see provider note).
        const res = await fetch("/api/youtube/subscriptions?type=watchlater");
        if (!res.ok) return;
        const data = await res.json();
        if (mounted) setVideos(data.videos ?? []);
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <Clock className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">
          Liked videos will appear here
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-0.5 pr-2">
        {videos.map((video) => (
          <VideoItem
            key={video.id}
            video={video}
            onSelect={onSelect}
            isActive={activeVideoId === video.id}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

// ─── Main YouTubePanel ──────────────────────────────────────────

export function YouTubePanel({ id }: YouTubePanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("search");
  const [authError, setAuthError] = useState(false);

  const playerId = `yt-player-${id}`;
  const player = useYouTubePlayer(playerId);

  // Check auth on mount
  useEffect(() => {
    let mounted = true;
    async function checkAuth() {
      try {
        const res = await fetch("/api/youtube/playlists");
        if (res.status === 401 && mounted) {
          setAuthError(true);
        }
      } catch {
        // ignore
      }
    }
    checkAuth();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSelectVideo = useCallback(
    (videoId: string) => {
      player.loadVideo(videoId);
    },
    [player]
  );

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "search", label: "Search", icon: <Search className="h-3 w-3" /> },
    {
      key: "subscriptions",
      label: "Subs",
      icon: <Rss className="h-3 w-3" />,
    },
    {
      key: "playlists",
      label: "Lists",
      icon: <ListVideo className="h-3 w-3" />,
    },
    {
      key: "watchlater",
      label: "Liked",
      icon: <Clock className="h-3 w-3" />,
    },
  ];

  // Auth error
  if (authError) {
    return (
      <BasePanel
        id={id}
        title="YouTube"
        icon={<Youtube className="h-4 w-4" />}
      >
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
          <LogIn className="h-10 w-10 text-muted-foreground/50" />
          <div>
            <p className="text-sm font-medium">Connect YouTube</p>
            <p className="text-xs text-muted-foreground mt-1">
              Sign in with your Google account to access YouTube
            </p>
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={() => window.open("/api/auth/signin", "_blank")}
          >
            Sign In
          </Button>
        </div>
      </BasePanel>
    );
  }

  return (
    <BasePanel
      id={id}
      title="YouTube"
      icon={<Youtube className="h-4 w-4" />}
      headerActions={
        player.playing ? (
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 text-red-600"
          >
            <Play className="h-2.5 w-2.5 mr-0.5 fill-red-600" />
            Playing
          </Badge>
        ) : null
      }
    >
      <div className="flex flex-col gap-2 h-full">
        {/* Player embed */}
        <div className="relative w-full rounded-md overflow-hidden bg-black aspect-video shrink-0">
          {!player.videoId && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10 bg-muted/80">
              <Youtube className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">
                Select a video to play
              </p>
            </div>
          )}
          <div id={playerId} className="w-full h-full" />
        </div>

        {/* Tab bar */}
        <div className="flex gap-0.5 border-b pb-1 shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-1 rounded-t-md px-2 py-1 text-xs transition-colors",
                activeTab === tab.key
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0">
          {activeTab === "search" && (
            <SearchTab
              onSelect={handleSelectVideo}
              activeVideoId={player.videoId}
            />
          )}
          {activeTab === "subscriptions" && (
            <SubscriptionsTab
              onSelect={handleSelectVideo}
              activeVideoId={player.videoId}
            />
          )}
          {activeTab === "playlists" && <PlaylistsTab />}
          {activeTab === "watchlater" && (
            <WatchLaterTab
              onSelect={handleSelectVideo}
              activeVideoId={player.videoId}
            />
          )}
        </div>
      </div>
    </BasePanel>
  );
}
