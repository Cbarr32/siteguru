"use client";

import React, { useState, useEffect, useCallback } from "react";
import { BasePanel } from "./BasePanel";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Instagram,
  Heart,
  MessageCircle,
  Eye,
  Bookmark,
  Users,
  Grid3X3,
  X,
  ExternalLink,
  Loader2,
  AlertCircle,
  LogIn,
  Image as ImageIcon,
  Play,
  BarChart3,
} from "lucide-react";


// ─── Types ──────────────────────────────────────────────────────

interface InstagramPanelProps {
  id: string;
}

interface InstagramAccount {
  id: string;
  username: string;
  name?: string;
  profilePictureUrl?: string;
  followersCount: number;
  followsCount: number;
  mediaCount: number;
  biography?: string;
}

interface InstagramMedia {
  id: string;
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  mediaUrl?: string;
  thumbnailUrl?: string;
  caption?: string;
  timestamp: string;
  likeCount: number;
  commentsCount: number;
  permalink: string;
}

interface InsightsData {
  impressions?: number;
  reach?: number;
  engagement?: number;
  saved?: number;
}

type ViewMode = "grid" | "detail" | "insights";

// ─── Helpers ────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function getMediaTypeIcon(type: string) {
  switch (type) {
    case "VIDEO":
      return <Play className="h-3 w-3" />;
    case "CAROUSEL_ALBUM":
      return <Grid3X3 className="h-3 w-3" />;
    default:
      return null;
  }
}

function getThumbnail(media: InstagramMedia): string {
  return media.thumbnailUrl || media.mediaUrl || "";
}

// ─── Profile Header ─────────────────────────────────────────────

function ProfileHeader({ account }: { account: InstagramAccount }) {
  return (
    <div className="flex items-center gap-3">
      {/* Avatar */}
      {account.profilePictureUrl ? (
        /* eslint-disable @next/next/no-img-element */
        <img
          src={account.profilePictureUrl}
          alt={account.username}
          className="h-12 w-12 rounded-full object-cover border-2 border-primary/20"
        />
        /* eslint-enable @next/next/no-img-element */
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 text-white font-bold text-lg">
          {account.username[0]?.toUpperCase() || "?"}
        </div>
      )}

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate">
          @{account.username}
        </p>
        {account.name && (
          <p className="text-xs text-muted-foreground truncate">
            {account.name}
          </p>
        )}
        <div className="flex items-center gap-3 mt-1">
          <StatItem label="Posts" value={account.mediaCount} />
          <StatItem label="Followers" value={account.followersCount} />
          <StatItem label="Following" value={account.followsCount} />
        </div>
      </div>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-xs font-bold">{formatCount(value)}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

// ─── Media Grid ─────────────────────────────────────────────────

function MediaGrid({
  media,
  onSelect,
}: {
  media: InstagramMedia[];
  onSelect: (m: InstagramMedia) => void;
}) {
  if (media.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">No posts yet</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-1">
      {media.map((m) => {
        const thumb = getThumbnail(m);
        const typeIcon = getMediaTypeIcon(m.mediaType);

        return (
          <button
            key={m.id}
            onClick={() => onSelect(m)}
            className="group relative aspect-square overflow-hidden rounded-sm bg-muted"
          >
            {thumb ? (
              /* eslint-disable @next/next/no-img-element */
              <img
                src={thumb}
                alt={m.caption?.slice(0, 50) || "Instagram post"}
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
                loading="lazy"
              />
              /* eslint-enable @next/next/no-img-element */
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
              </div>
            )}

            {/* Type indicator */}
            {typeIcon && (
              <div className="absolute top-1 right-1 text-white drop-shadow-md">
                {typeIcon}
              </div>
            )}

            {/* Hover overlay */}
            <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex items-center gap-1 text-white text-xs font-medium">
                <Heart className="h-3 w-3" />
                {formatCount(m.likeCount)}
              </div>
              <div className="flex items-center gap-1 text-white text-xs font-medium">
                <MessageCircle className="h-3 w-3" />
                {formatCount(m.commentsCount)}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Post Detail View ───────────────────────────────────────────

function PostDetail({
  media,
  onClose,
  onViewInsights,
}: {
  media: InstagramMedia;
  onClose: () => void;
  onViewInsights: (m: InstagramMedia) => void;
}) {
  const thumb = getThumbnail(media);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="text-[10px]">
          {media.mediaType === "VIDEO"
            ? "Video"
            : media.mediaType === "CAROUSEL_ALBUM"
              ? "Carousel"
              : "Photo"}
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Image */}
      {thumb && (
        /* eslint-disable @next/next/no-img-element */
        <div className="overflow-hidden rounded-lg">
          <img
            src={media.mediaUrl || thumb}
            alt={media.caption?.slice(0, 80) || "Post"}
            className="w-full object-cover max-h-[250px]"
          />
        </div>
        /* eslint-enable @next/next/no-img-element */
      )}

      {/* Engagement */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 text-sm">
          <Heart className="h-4 w-4 text-red-500" />
          <span className="font-medium">{formatCount(media.likeCount)}</span>
        </div>
        <div className="flex items-center gap-1 text-sm">
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">
            {formatCount(media.commentsCount)}
          </span>
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {formatTimestamp(media.timestamp)}
        </span>
      </div>

      {/* Caption */}
      {media.caption && (
        <p className="text-xs text-foreground/90 whitespace-pre-wrap line-clamp-6">
          {media.caption}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-7 text-xs"
          onClick={() => onViewInsights(media)}
        >
          <BarChart3 className="h-3 w-3 mr-1" />
          Insights
        </Button>
        <a
          href={media.permalink}
          target="_blank"
          rel="noopener noreferrer"
          title="Open on Instagram"
          className="inline-flex items-center justify-center gap-1 rounded-md border border-input bg-background px-3 h-7 text-xs font-medium hover:bg-accent transition-colors flex-1"
        >
          <ExternalLink className="h-3 w-3" />
          Open
        </a>
      </div>
    </div>
  );
}

// ─── Post Insights View ─────────────────────────────────────────

function PostInsights({
  media,
  onBack,
}: {
  media: InstagramMedia;
  onBack: () => void;
}) {
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Fetch insights from the feed route (which includes the data)
        // For per-post insights, we hit the Graph API via a dedicated
        // endpoint. For now we show basic engagement from the media object.
        // The server-side fetchInsights can be called from a dedicated route
        // if needed later.
        setInsights({
          engagement: media.likeCount + media.commentsCount,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [media]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Post Insights</h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          onClick={onBack}
        >
          Back
        </Button>
      </div>

      <p className="text-xs text-muted-foreground truncate">
        {media.caption?.slice(0, 60) || "Post"}{" "}
        · {formatTimestamp(media.timestamp)}
      </p>

      <Separator />

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      ) : insights ? (
        <div className="grid grid-cols-2 gap-2">
          <InsightCard
            icon={<Heart className="h-4 w-4 text-red-500" />}
            label="Likes"
            value={media.likeCount}
          />
          <InsightCard
            icon={<MessageCircle className="h-4 w-4 text-blue-500" />}
            label="Comments"
            value={media.commentsCount}
          />
          <InsightCard
            icon={<Users className="h-4 w-4 text-purple-500" />}
            label="Engagement"
            value={insights.engagement ?? 0}
          />
          {insights.impressions != null && (
            <InsightCard
              icon={<Eye className="h-4 w-4 text-cyan-500" />}
              label="Impressions"
              value={insights.impressions}
            />
          )}
          {insights.reach != null && (
            <InsightCard
              icon={<Eye className="h-4 w-4 text-green-500" />}
              label="Reach"
              value={insights.reach}
            />
          )}
          {insights.saved != null && (
            <InsightCard
              icon={<Bookmark className="h-4 w-4 text-yellow-500" />}
              label="Saved"
              value={insights.saved}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

function InsightCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border p-2">
      {icon}
      <div>
        <p className="text-sm font-bold">{formatCount(value)}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// ─── Engagement Stats Bar ───────────────────────────────────────

function EngagementStats({ media }: { media: InstagramMedia[] }) {
  if (media.length === 0) return null;

  const totalLikes = media.reduce((s, m) => s + m.likeCount, 0);
  const totalComments = media.reduce((s, m) => s + m.commentsCount, 0);
  const avgLikes = Math.round(totalLikes / media.length);
  const avgComments = Math.round(totalComments / media.length);

  return (
    <div className="flex items-center justify-between px-1 py-1">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <Heart className="h-3 w-3 text-red-500" />
          <span className="text-[10px] text-muted-foreground">
            avg {formatCount(avgLikes)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <MessageCircle className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">
            avg {formatCount(avgComments)}
          </span>
        </div>
      </div>
      <span className="text-[10px] text-muted-foreground">
        {media.length} recent posts
      </span>
    </div>
  );
}

// ─── Main InstagramPanel ────────────────────────────────────────

export function InstagramPanel({ id }: InstagramPanelProps) {
  const [account, setAccount] = useState<InstagramAccount | null>(null);
  const [media, setMedia] = useState<InstagramMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("grid");
  const [selectedMedia, setSelectedMedia] = useState<InstagramMedia | null>(
    null
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/instagram/feed");
      if (res.status === 401) {
        setAuthError(true);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load");
      }
      const data = await res.json();
      setAccount(data.account ?? null);
      setMedia(data.media ?? []);
      setAuthError(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = useCallback(() => {
    fetchData();
  }, [fetchData]);

  const handleSelectMedia = useCallback((m: InstagramMedia) => {
    setSelectedMedia(m);
    setView("detail");
  }, []);

  const handleViewInsights = useCallback((m: InstagramMedia) => {
    setSelectedMedia(m);
    setView("insights");
  }, []);

  // Auth error
  if (authError) {
    return (
      <BasePanel
        id={id}
        title="Instagram"
        icon={<Instagram className="h-4 w-4" />}
      >
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
          <LogIn className="h-10 w-10 text-muted-foreground/50" />
          <div>
            <p className="text-sm font-medium">Connect Instagram</p>
            <p className="text-xs text-muted-foreground mt-1">
              Sign in with Facebook to view your Instagram
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
      title="Instagram"
      icon={<Instagram className="h-4 w-4" />}
      isLoading={loading}
      onRefresh={handleRefresh}
    >
      <div className="flex flex-col gap-2 h-full">
        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        {/* Detail view */}
        {view === "detail" && selectedMedia && (
          <PostDetail
            media={selectedMedia}
            onClose={() => {
              setSelectedMedia(null);
              setView("grid");
            }}
            onViewInsights={handleViewInsights}
          />
        )}

        {/* Insights view */}
        {view === "insights" && selectedMedia && (
          <PostInsights
            media={selectedMedia}
            onBack={() => {
              setView("detail");
            }}
          />
        )}

        {/* Grid view */}
        {view === "grid" && (
          <>
            {/* Profile header */}
            {account && <ProfileHeader account={account} />}

            <Separator />

            {/* Engagement stats */}
            <EngagementStats media={media} />

            {/* Media grid */}
            <div className="flex-1 min-h-0">
              <ScrollArea className="h-[260px]">
                <MediaGrid media={media} onSelect={handleSelectMedia} />
              </ScrollArea>
            </div>
          </>
        )}
      </div>
    </BasePanel>
  );
}
