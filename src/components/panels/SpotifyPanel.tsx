"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { BasePanel } from "./BasePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Music,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Search,
  ListMusic,
  Clock,
  Plus,
  ExternalLink,
  Disc3,
  AlertCircle,
  LogIn,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSpotifyPlayer } from "@/hooks/useSpotifyPlayer";

// ─── Types ──────────────────────────────────────────────────────

interface SpotifyPanelProps {
  id: string;
}

interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  artists: { id: string; name: string; uri: string }[];
  album: {
    id: string;
    name: string;
    images: { url: string; height: number | null; width: number | null }[];
    uri: string;
  };
  durationMs: number;
  explicit: boolean;
  previewUrl: string | null;
}

interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string | null;
  images: { url: string; height: number | null; width: number | null }[];
  trackCount: number;
  uri: string;
  owner: { displayName: string; id: string };
  isPublic: boolean;
}

type TabKey = "playing" | "recent" | "playlists" | "top" | "search";

// ─── Helpers ────────────────────────────────────────────────────

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getAlbumArt(
  images: { url: string; height: number | null; width: number | null }[],
  size: "small" | "medium" | "large" = "medium"
): string {
  if (!images || images.length === 0) return "";
  if (size === "small") return images[images.length - 1]?.url ?? images[0].url;
  if (size === "large") return images[0]?.url ?? images[0].url;
  return images[Math.min(1, images.length - 1)]?.url ?? images[0].url;
}

// ─── Sub-components ─────────────────────────────────────────────

function TrackRow({
  track,
  index,
  showAlbumArt = true,
  onQueue,
}: {
  track: SpotifyTrack;
  index: number;
  showAlbumArt?: boolean;
  onQueue?: (uri: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50 group">
      <span className="w-5 text-right text-xs text-muted-foreground shrink-0">
        {index + 1}
      </span>
      {showAlbumArt && track.album.images.length > 0 && (
        <img
          src={getAlbumArt(track.album.images, "small")}
          alt=""
          className="h-8 w-8 rounded shrink-0"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">
          {track.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {track.artists.map((a) => a.name).join(", ")}
        </p>
      </div>
      <span className="text-xs text-muted-foreground shrink-0">
        {formatMs(track.durationMs)}
      </span>
      {onQueue && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
          onClick={() => onQueue(track.uri)}
          title="Add to queue"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

// ─── Now Playing View ───────────────────────────────────────────

function NowPlayingView({
  state,
  onPlay,
  onPause,
  onNext,
  onPrevious,
  onToggleShuffle,
  onSeek,
  onVolumeChange,
}: {
  state: ReturnType<typeof useSpotifyPlayer>["state"];
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onToggleShuffle: () => void;
  onSeek: (ms: number) => void;
  onVolumeChange: (percent: number) => void;
}) {
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [localVolume, setLocalVolume] = useState(
    state.device?.volumePercent ?? 50
  );

  useEffect(() => {
    if (state.device?.volumePercent != null) {
      setLocalVolume(state.device.volumePercent);
    }
  }, [state.device?.volumePercent]);

  if (!state.track) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
        <Disc3 className="h-12 w-12 text-muted-foreground/50" />
        <div>
          <p className="text-sm font-medium">Nothing playing</p>
          <p className="text-xs text-muted-foreground">
            Start playing something on Spotify to see it here
          </p>
        </div>
      </div>
    );
  }

  const { track, isPlaying, progressMs, durationMs, shuffleState, repeatState } =
    state;
  const progressPercent = durationMs > 0 ? (progressMs / durationMs) * 100 : 0;

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || durationMs === 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    onSeek(Math.round(percent * durationMs));
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Album Art + Track Info */}
      <div className="flex items-center gap-3">
        {track.album.images.length > 0 && (
          <img
            src={getAlbumArt(track.album.images, "medium")}
            alt={track.album.name}
            className="h-16 w-16 rounded-md shadow-sm shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{track.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {track.artists.map((a) => a.name).join(", ")}
          </p>
          <p className="truncate text-[11px] text-muted-foreground/70">
            {track.album.name}
          </p>
          {track.explicit && (
            <Badge variant="outline" className="mt-0.5 text-[10px] px-1 py-0">
              E
            </Badge>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1">
        <div
          ref={progressBarRef}
          className="h-1.5 w-full cursor-pointer rounded-full bg-muted"
          onClick={handleProgressClick}
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{formatMs(progressMs)}</span>
          <span>{formatMs(durationMs)}</span>
        </div>
      </div>

      {/* Playback Controls */}
      <div className="flex items-center justify-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8", shuffleState && "text-primary")}
          onClick={onToggleShuffle}
          title={shuffleState ? "Disable shuffle" : "Enable shuffle"}
        >
          <Shuffle className="h-3.5 w-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onPrevious}
          title="Previous"
        >
          <SkipBack className="h-4 w-4" />
        </Button>

        <Button
          variant="default"
          size="icon"
          className="h-9 w-9 rounded-full"
          onClick={isPlaying ? onPause : onPlay}
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4 ml-0.5" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onNext}
          title="Next"
        >
          <SkipForward className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8",
            repeatState !== "off" && "text-primary"
          )}
          title={`Repeat: ${repeatState}`}
        >
          {repeatState === "track" ? (
            <Repeat1 className="h-3.5 w-3.5" />
          ) : (
            <Repeat className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-2 px-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={() => {
            const newVol = localVolume > 0 ? 0 : 50;
            setLocalVolume(newVol);
            onVolumeChange(newVol);
          }}
          title={localVolume > 0 ? "Mute" : "Unmute"}
        >
          {localVolume > 0 ? (
            <Volume2 className="h-3.5 w-3.5" />
          ) : (
            <VolumeX className="h-3.5 w-3.5" />
          )}
        </Button>
        <input
          type="range"
          min={0}
          max={100}
          value={localVolume}
          aria-label="Volume"
          onChange={(e) => {
            const v = Number(e.target.value);
            setLocalVolume(v);
            onVolumeChange(v);
          }}
          className="h-1 flex-1 cursor-pointer accent-primary"
        />
        <span className="text-[10px] text-muted-foreground w-7 text-right shrink-0">
          {localVolume}%
        </span>
      </div>
    </div>
  );
}

// ─── Recently Played View ───────────────────────────────────────

function RecentlyPlayedView({ onQueue }: { onQueue: (uri: string) => void }) {
  const [tracks] = useState<SpotifyTrack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch("/api/spotify/now-playing");
        if (!res.ok) return;
        // We reuse now-playing for the main state; for recently played
        // we'd need a separate endpoint. For now, show a placeholder.
        // TODO: Add /api/spotify/recent endpoint
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
        <Disc3 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <Clock className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">
          Recently played tracks will appear here
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[300px]">
      <div className="space-y-0.5">
        {tracks.map((track, i) => (
          <TrackRow key={`${track.id}-${i}`} track={track} index={i} onQueue={onQueue} />
        ))}
      </div>
    </ScrollArea>
  );
}

// ─── Playlists View ─────────────────────────────────────────────

function PlaylistsView() {
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch("/api/spotify/playlists");
        if (!res.ok) return;
        const data = await res.json();
        if (mounted) setPlaylists(data.playlists ?? data ?? []);
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
        <Disc3 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (playlists.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <ListMusic className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">No playlists found</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[300px]">
      <div className="space-y-1">
        {playlists.map((pl) => (
          <div
            key={pl.id}
            className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50 group"
          >
            {pl.images.length > 0 ? (
              <img
                src={getAlbumArt(pl.images, "small")}
                alt=""
                className="h-10 w-10 rounded shrink-0"
              />
            ) : (
              <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                <ListMusic className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{pl.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {pl.trackCount} tracks · {pl.owner.displayName}
              </p>
            </div>
            <a
              href={`https://open.spotify.com/playlist/${pl.id}`}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open ${pl.name} on Spotify`}
              className="opacity-0 group-hover:opacity-100"
            >
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            </a>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

// ─── Top Tracks View ────────────────────────────────────────────

function TopTracksView({ onQueue }: { onQueue: (uri: string) => void }) {
  const [tracks, setTracks] = useState<SpotifyTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<string>("short_term");

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/spotify/playlists?type=top&time_range=${timeRange}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (mounted) setTracks(data.tracks ?? []);
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
  }, [timeRange]);

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {[
          { key: "short_term", label: "4 weeks" },
          { key: "medium_term", label: "6 months" },
          { key: "long_term", label: "All time" },
        ].map((t) => (
          <Button
            key={t.key}
            variant={timeRange === t.key ? "default" : "ghost"}
            size="sm"
            className="h-6 text-xs px-2"
            onClick={() => setTimeRange(t.key)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Disc3 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : tracks.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <Music className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground">No top tracks found</p>
        </div>
      ) : (
        <ScrollArea className="h-[270px]">
          <div className="space-y-0.5">
            {tracks.map((track, i) => (
              <TrackRow
                key={track.id}
                track={track}
                index={i}
                onQueue={onQueue}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// ─── Search View ────────────────────────────────────────────────

function SearchView({ onQueue }: { onQueue: (uri: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpotifyTrack[]>([]);
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
        `/api/spotify/search?q=${encodeURIComponent(q)}&type=track`
      );
      if (!res.ok) return;
      const data = await res.json();
      setResults(data.tracks ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 400);
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={handleInputChange}
          placeholder="Search songs, artists, albums..."
          className="h-8 pl-7 text-sm"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Disc3 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : results.length > 0 ? (
        <ScrollArea className="h-[270px]">
          <div className="space-y-0.5">
            {results.map((track, i) => (
              <TrackRow
                key={track.id}
                track={track}
                index={i}
                onQueue={onQueue}
              />
            ))}
          </div>
        </ScrollArea>
      ) : searched ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <Search className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground">
            No results found for &ldquo;{query}&rdquo;
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <Search className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground">
            Search for songs, artists, or albums
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main SpotifyPanel ──────────────────────────────────────────

export function SpotifyPanel({ id }: SpotifyPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("playing");
  const player = useSpotifyPlayer(true);

  const handleQueue = useCallback(async (trackUri: string) => {
    try {
      await fetch("/api/spotify/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackUri }),
      });
    } catch {
      // ignore
    }
  }, []);

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "playing", label: "Now", icon: <Music className="h-3 w-3" /> },
    { key: "recent", label: "Recent", icon: <Clock className="h-3 w-3" /> },
    {
      key: "playlists",
      label: "Lists",
      icon: <ListMusic className="h-3 w-3" />,
    },
    { key: "top", label: "Top", icon: <Disc3 className="h-3 w-3" /> },
    { key: "search", label: "Search", icon: <Search className="h-3 w-3" /> },
  ];

  // Auth error – not signed in with Spotify
  if (player.authError) {
    return (
      <BasePanel
        id={id}
        title="Spotify"
        icon={<Music className="h-4 w-4" />}
      >
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
          <LogIn className="h-10 w-10 text-muted-foreground/50" />
          <div>
            <p className="text-sm font-medium">Connect Spotify</p>
            <p className="text-xs text-muted-foreground mt-1">
              Sign in with your Spotify account to see your music here
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
      title="Spotify"
      icon={<Music className="h-4 w-4" />}
      isLoading={player.loading}
      onRefresh={() => player.refresh()}
      headerActions={
        player.sdkFailed ? (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600">
            <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
            API only
          </Badge>
        ) : player.sdkReady ? (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-600">
            SDK
          </Badge>
        ) : null
      }
    >
      <div className="flex flex-col gap-2 h-full">
        {/* Error */}
        {player.error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {player.error}
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-0.5 border-b pb-1">
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
          {activeTab === "playing" && (
            <NowPlayingView
              state={player.state}
              onPlay={player.play}
              onPause={player.pause}
              onNext={player.next}
              onPrevious={player.previous}
              onToggleShuffle={player.toggleShuffle}
              onSeek={player.seek}
              onVolumeChange={player.setVolume}
            />
          )}
          {activeTab === "recent" && <RecentlyPlayedView onQueue={handleQueue} />}
          {activeTab === "playlists" && <PlaylistsView />}
          {activeTab === "top" && <TopTracksView onQueue={handleQueue} />}
          {activeTab === "search" && <SearchView onQueue={handleQueue} />}
        </div>
      </div>
    </BasePanel>
  );
}
