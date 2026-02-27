/**
 * Instagram Graph API Provider (via Facebook Login)
 *
 * Uses the Instagram Graph API for Business/Creator accounts.
 * Requires a Facebook user access token with Instagram permissions:
 *   - instagram_basic
 *   - instagram_manage_insights
 *   - pages_show_list
 *   - pages_read_engagement
 *
 * Flow: Facebook token → /me/accounts → Page access token →
 *       IG Business Account ID → Instagram Graph API
 *
 * Base URL: https://graph.facebook.com/v19.0
 * Instagram Graph API: https://graph.instagram.com
 */

const GRAPH_FB = "https://graph.facebook.com/v19.0";

// ─── Types ──────────────────────────────────────────────────────

export interface InstagramAccount {
  id: string;
  username: string;
  name?: string;
  profilePictureUrl?: string;
  followersCount: number;
  followsCount: number;
  mediaCount: number;
  biography?: string;
  website?: string;
}

export interface InstagramMedia {
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

export interface InstagramInsights {
  mediaId: string;
  impressions?: number;
  reach?: number;
  engagement?: number;
  saved?: number;
  shares?: number;
}

// ─── Errors ─────────────────────────────────────────────────────

export class InstagramApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "InstagramApiError";
  }
}

// ─── Internal fetch helper ──────────────────────────────────────

async function igFetch<T>(
  url: string,
  token: string,
  params: Record<string, string> = {}
): Promise<T> {
  const u = new URL(url);
  u.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v);
  }

  const res = await fetch(u.toString());

  if (!res.ok) {
    let message = `Instagram API error: ${res.status}`;
    try {
      const errBody = await res.json();
      message =
        errBody?.error?.message || errBody?.error?.error_user_msg || message;
    } catch {
      // ignore parse errors
    }
    throw new InstagramApiError(message, res.status);
  }

  return (await res.json()) as T;
}

// ─── Resolve Instagram Business Account ID ──────────────────────

/**
 * Given a Facebook user token, discover the IG Business Account ID
 * by walking: /me/accounts → page → instagram_business_account.
 */
async function resolveIgAccountId(token: string): Promise<string> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const pagesData = await igFetch<any>(
    `${GRAPH_FB}/me/accounts`,
    token,
    { fields: "id,name,instagram_business_account" }
  );

  const pages = pagesData.data || [];

  for (const page of pages) {
    if (page.instagram_business_account?.id) {
      return page.instagram_business_account.id;
    }
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  throw new InstagramApiError(
    "No Instagram Business or Creator account found linked to your Facebook Pages.",
    404
  );
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Fetch the Instagram Business account info (profile).
 */
export async function fetchAccountInfo(
  token: string
): Promise<InstagramAccount> {
  const igId = await resolveIgAccountId(token);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const data = await igFetch<any>(
    `${GRAPH_FB}/${igId}`,
    token,
    {
      fields:
        "id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography,website",
    }
  );
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return {
    id: data.id,
    username: data.username || "",
    name: data.name || undefined,
    profilePictureUrl: data.profile_picture_url || undefined,
    followersCount: data.followers_count ?? 0,
    followsCount: data.follows_count ?? 0,
    mediaCount: data.media_count ?? 0,
    biography: data.biography || undefined,
    website: data.website || undefined,
  };
}

/**
 * Fetch the recent media feed for the Instagram Business account.
 */
export async function fetchFeed(
  token: string
): Promise<{ media: InstagramMedia[]; account: InstagramAccount }> {
  const igId = await resolveIgAccountId(token);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [accountData, mediaData] = await Promise.all([
    igFetch<any>(`${GRAPH_FB}/${igId}`, token, {
      fields:
        "id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography,website",
    }),
    igFetch<any>(`${GRAPH_FB}/${igId}/media`, token, {
      fields:
        "id,media_type,media_url,thumbnail_url,caption,timestamp,like_count,comments_count,permalink",
      limit: "25",
    }),
  ]);

  const account: InstagramAccount = {
    id: accountData.id,
    username: accountData.username || "",
    name: accountData.name || undefined,
    profilePictureUrl: accountData.profile_picture_url || undefined,
    followersCount: accountData.followers_count ?? 0,
    followsCount: accountData.follows_count ?? 0,
    mediaCount: accountData.media_count ?? 0,
    biography: accountData.biography || undefined,
    website: accountData.website || undefined,
  };

  const media: InstagramMedia[] = (mediaData.data || []).map((item: any) => ({
    id: item.id,
    mediaType: item.media_type || "IMAGE",
    mediaUrl: item.media_url || undefined,
    thumbnailUrl: item.thumbnail_url || undefined,
    caption: item.caption || undefined,
    timestamp: item.timestamp || "",
    likeCount: item.like_count ?? 0,
    commentsCount: item.comments_count ?? 0,
    permalink: item.permalink || "",
  }));
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return { media, account };
}

/**
 * Fetch engagement insights for a specific media post.
 * Only works for IMAGE and CAROUSEL_ALBUM (video has different metrics).
 */
export async function fetchInsights(
  token: string,
  mediaId: string
): Promise<InstagramInsights> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const data = await igFetch<any>(
    `${GRAPH_FB}/${mediaId}/insights`,
    token,
    {
      metric: "impressions,reach,engagement,saved",
    }
  );

  const metrics: Record<string, number> = {};
  for (const item of data.data || []) {
    if (item.name && item.values?.[0]?.value != null) {
      metrics[item.name] = item.values[0].value;
    }
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return {
    mediaId,
    impressions: metrics.impressions,
    reach: metrics.reach,
    engagement: metrics.engagement,
    saved: metrics.saved,
  };
}
