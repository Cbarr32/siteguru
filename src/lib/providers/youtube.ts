/**
 * YouTube Data API v3 Provider
 *
 * Wraps the YouTube Data API for searching videos, fetching playlists,
 * subscription feeds, and watch later items.
 *
 * Uses the Google OAuth2 access token (shared with Gmail).
 * Requires scope: https://www.googleapis.com/auth/youtube.readonly
 */

const YT_API = "https://www.googleapis.com/youtube/v3";

// ─── Types ──────────────────────────────────────────────────────

export interface YouTubeThumbnail {
  url: string;
  width: number;
  height: number;
}

export interface YouTubeThumbnails {
  default?: YouTubeThumbnail;
  medium?: YouTubeThumbnail;
  high?: YouTubeThumbnail;
  standard?: YouTubeThumbnail;
  maxres?: YouTubeThumbnail;
}

export interface YouTubeVideo {
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

export interface YouTubePlaylist {
  id: string;
  title: string;
  description: string;
  thumbnails: YouTubeThumbnails;
  channelTitle: string;
  itemCount: number;
  publishedAt: string;
}

export interface YouTubeSearchResult {
  videos: YouTubeVideo[];
  nextPageToken: string | null;
  totalResults: number;
}

export interface YouTubePlaylistResult {
  playlists: YouTubePlaylist[];
  nextPageToken: string | null;
}

export interface YouTubeSubscriptionFeedResult {
  videos: YouTubeVideo[];
  nextPageToken: string | null;
}

// ─── Errors ─────────────────────────────────────────────────────

export class YouTubeApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = "YouTubeApiError";
  }
}

// ─── Helper ─────────────────────────────────────────────────────

async function ytFetch<T>(
  token: string,
  endpoint: string,
  params: Record<string, string> = {}
): Promise<T> {
  const url = new URL(`${YT_API}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    let message = `YouTube API error: ${res.status}`;
    try {
      const body = await res.json();
      message = body?.error?.message || message;
    } catch {
      // ignore parse error
    }
    throw new YouTubeApiError(message, res.status);
  }

  return (await res.json()) as T;
}

// ─── Parse helpers ──────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

function parseVideo(item: any, statsMap?: Map<string, any>): YouTubeVideo {
  const snippet = item.snippet || {};
  const videoId =
    typeof item.id === "string"
      ? item.id
      : item.id?.videoId || item.contentDetails?.videoId || "";

  const stats = statsMap?.get(videoId);

  return {
    id: videoId,
    title: snippet.title || "",
    description: snippet.description || "",
    channelId: snippet.channelId || "",
    channelTitle: snippet.channelTitle || "",
    thumbnails: snippet.thumbnails || {},
    publishedAt: snippet.publishedAt || "",
    viewCount: stats?.viewCount ?? null,
    likeCount: stats?.likeCount ?? null,
    duration: stats?.duration ?? null,
  };
}

function parsePlaylist(item: any): YouTubePlaylist {
  const snippet = item.snippet || {};
  return {
    id: item.id || "",
    title: snippet.title || "",
    description: snippet.description || "",
    thumbnails: snippet.thumbnails || {},
    channelTitle: snippet.channelTitle || "",
    itemCount: item.contentDetails?.itemCount ?? 0,
    publishedAt: snippet.publishedAt || "",
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Batch video stats ──────────────────────────────────────────

async function fetchVideoStats(
  token: string,
  videoIds: string[]
): Promise<Map<string, { viewCount: string; likeCount: string; duration: string }>> {
  const map = new Map<string, { viewCount: string; likeCount: string; duration: string }>();
  if (videoIds.length === 0) return map;

  // YouTube API allows up to 50 IDs per request
  const chunks: string[][] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    chunks.push(videoIds.slice(i, i + 50));
  }

  for (const chunk of chunks) {
    const data = await ytFetch<{ items?: Array<{ id: string; statistics?: Record<string, string>; contentDetails?: Record<string, string> }> }>(
      token,
      "videos",
      {
        part: "statistics,contentDetails",
        id: chunk.join(","),
      }
    );
    for (const item of data.items || []) {
      map.set(item.id, {
        viewCount: item.statistics?.viewCount || "0",
        likeCount: item.statistics?.likeCount || "0",
        duration: item.contentDetails?.duration || "",
      });
    }
  }

  return map;
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Search YouTube videos.
 */
export async function searchVideos(
  token: string,
  query: string,
  maxResults: number = 12
): Promise<YouTubeSearchResult> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const data = await ytFetch<any>(token, "search", {
    part: "snippet",
    type: "video",
    q: query,
    maxResults: String(maxResults),
    order: "relevance",
  });

  const items: any[] = data.items || [];
  const videoIds = items
    .map((i: any) => i.id?.videoId)
    .filter(Boolean) as string[];

  const stats = await fetchVideoStats(token, videoIds);

  return {
    videos: items.map((item: any) => parseVideo(item, stats)),
    nextPageToken: data.nextPageToken || null,
    totalResults: data.pageInfo?.totalResults ?? 0,
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/**
 * Fetch user's playlists.
 */
export async function fetchPlaylists(
  token: string
): Promise<YouTubePlaylistResult> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const data = await ytFetch<any>(token, "playlists", {
    part: "snippet,contentDetails",
    mine: "true",
    maxResults: "25",
  });

  return {
    playlists: (data.items || []).map(parsePlaylist),
    nextPageToken: data.nextPageToken || null,
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/**
 * Fetch recent videos from user's subscriptions.
 *
 * Strategy: get subscribed channels, then fetch each channel's latest uploads.
 * The API doesn't have a direct "subscription feed" endpoint, so we:
 * 1. Fetch subscriptions (channel IDs)
 * 2. Fetch the "activities" or use search with channelId
 *
 * For efficiency, we use the activities endpoint.
 */
export async function fetchSubscriptionFeed(
  token: string
): Promise<YouTubeSubscriptionFeedResult> {
  /* eslint-disable @typescript-eslint/no-explicit-any */

  // Step 1: Get subscribed channel IDs
  const subsData = await ytFetch<any>(token, "subscriptions", {
    part: "snippet",
    mine: "true",
    maxResults: "20",
    order: "relevance",
  });

  const channelIds: string[] = (subsData.items || [])
    .map((item: any) => item.snippet?.resourceId?.channelId)
    .filter(Boolean);

  if (channelIds.length === 0) {
    return { videos: [], nextPageToken: null };
  }

  // Step 2: Search for recent uploads from those channels (batch via search)
  // We pick the top 8 channels to keep quota manageable
  const topChannels = channelIds.slice(0, 8);

  const allVideos: YouTubeVideo[] = [];

  // Fetch recent videos from each channel in parallel (limited)
  const promises = topChannels.map(async (channelId) => {
    try {
      const searchData = await ytFetch<any>(token, "search", {
        part: "snippet",
        type: "video",
        channelId,
        maxResults: "3",
        order: "date",
      });
      return (searchData.items || []).map((item: any) => parseVideo(item));
    } catch {
      return [];
    }
  });

  const results = await Promise.all(promises);
  for (const videos of results) {
    allVideos.push(...videos);
  }

  // Sort by publish date descending
  allVideos.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  // Fetch stats for all video IDs
  const videoIds = allVideos.map((v) => v.id).filter(Boolean);
  const stats = await fetchVideoStats(token, videoIds);

  const videosWithStats = allVideos.map((v) => {
    const s = stats.get(v.id);
    return s
      ? { ...v, viewCount: s.viewCount, likeCount: s.likeCount, duration: s.duration }
      : v;
  });

  return {
    videos: videosWithStats.slice(0, 20),
    nextPageToken: null,
  };

  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/**
 * Fetch watch later playlist items.
 *
 * Note: The YouTube Data API no longer allows access to the "Watch Later" (WL)
 * playlist via the API. As a fallback, we fetch the user's "Liked videos"
 * playlist (LL) or the first playlist found.
 */
export async function fetchWatchLater(
  token: string
): Promise<YouTubeSubscriptionFeedResult> {
  /* eslint-disable @typescript-eslint/no-explicit-any */

  // Try fetching channel info to get the "likes" playlist
  const channelData = await ytFetch<any>(token, "channels", {
    part: "contentDetails",
    mine: "true",
  });

  const likesPlaylistId =
    channelData.items?.[0]?.contentDetails?.relatedPlaylists?.likes;

  if (!likesPlaylistId) {
    return { videos: [], nextPageToken: null };
  }

  // Fetch items from the likes playlist
  const playlistData = await ytFetch<any>(token, "playlistItems", {
    part: "snippet,contentDetails",
    playlistId: likesPlaylistId,
    maxResults: "20",
  });

  const items: any[] = playlistData.items || [];
  const videoIds = items
    .map((i: any) => i.contentDetails?.videoId)
    .filter(Boolean) as string[];

  const stats = await fetchVideoStats(token, videoIds);

  return {
    videos: items.map((item: any) => parseVideo(item, stats)),
    nextPageToken: playlistData.nextPageToken || null,
  };

  /* eslint-enable @typescript-eslint/no-explicit-any */
}
