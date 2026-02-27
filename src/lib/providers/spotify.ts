/**
 * Spotify Web API Provider
 *
 * Wraps the Spotify Web API for playback control, search,
 * playlists, top tracks, and recently played.
 *
 * Requires a valid OAuth2 access token scoped to:
 *   - streaming
 *   - user-read-playback-state
 *   - user-modify-playback-state
 *   - user-read-currently-playing
 *   - playlist-read-private
 *   - user-library-read
 *   - user-top-read
 *   - user-read-recently-played
 */

const SPOTIFY_API = "https://api.spotify.com/v1";

// ─── Types ──────────────────────────────────────────────────────

export interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  uri: string;
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  images: SpotifyImage[];
  uri: string;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  durationMs: number;
  explicit: boolean;
  previewUrl: string | null;
}

export interface SpotifyPlaybackState {
  isPlaying: boolean;
  track: SpotifyTrack | null;
  progressMs: number;
  durationMs: number;
  shuffleState: boolean;
  repeatState: "off" | "context" | "track";
  device: {
    id: string;
    name: string;
    type: string;
    volumePercent: number;
  } | null;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string | null;
  images: SpotifyImage[];
  owner: string;
  trackCount: number;
  uri: string;
  isPublic: boolean;
}

export interface SpotifySearchResults {
  tracks: SpotifyTrack[];
  artists: { id: string; name: string; images: SpotifyImage[]; uri: string }[];
  albums: { id: string; name: string; images: SpotifyImage[]; artists: string[]; uri: string }[];
  playlists: { id: string; name: string; images: SpotifyImage[]; owner: string; uri: string }[];
}

// ─── Error ──────────────────────────────────────────────────────

export class SpotifyApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "SpotifyApiError";
  }
}

// ─── Helpers ────────────────────────────────────────────────────

async function spotifyFetch<T>(
  url: string,
  token: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  // 204 No Content — success with no body (common for playback control)
  if (res.status === 204) {
    return {} as T;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      body?.error?.message || body?.message || `Spotify API error: ${res.status}`;
    throw new SpotifyApiError(msg, res.status);
  }

  return res.json() as Promise<T>;
}

function parseTrack(raw: RawTrack): SpotifyTrack {
  return {
    id: raw.id,
    name: raw.name,
    uri: raw.uri,
    artists: raw.artists.map((a) => ({
      id: a.id,
      name: a.name,
      uri: a.uri,
    })),
    album: {
      id: raw.album.id,
      name: raw.album.name,
      images: raw.album.images,
      uri: raw.album.uri,
    },
    durationMs: raw.duration_ms,
    explicit: raw.explicit,
    previewUrl: raw.preview_url,
  };
}

// ─── Raw Spotify API types ──────────────────────────────────────

interface RawArtist {
  id: string;
  name: string;
  uri: string;
  images?: SpotifyImage[];
}

interface RawAlbum {
  id: string;
  name: string;
  images: SpotifyImage[];
  uri: string;
  artists?: RawArtist[];
}

interface RawTrack {
  id: string;
  name: string;
  uri: string;
  artists: RawArtist[];
  album: RawAlbum;
  duration_ms: number;
  explicit: boolean;
  preview_url: string | null;
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Get currently playing track and playback state.
 */
export async function fetchNowPlaying(
  token: string
): Promise<SpotifyPlaybackState> {
  try {
    const data = await spotifyFetch<{
      is_playing: boolean;
      item: RawTrack | null;
      progress_ms: number;
      shuffle_state: boolean;
      repeat_state: "off" | "context" | "track";
      device: {
        id: string;
        name: string;
        type: string;
        volume_percent: number;
      } | null;
    }>(`${SPOTIFY_API}/me/player`, token);

    // Empty response means no active device
    if (!data || !data.item) {
      return {
        isPlaying: false,
        track: null,
        progressMs: 0,
        durationMs: 0,
        shuffleState: false,
        repeatState: "off",
        device: null,
      };
    }

    return {
      isPlaying: data.is_playing,
      track: parseTrack(data.item),
      progressMs: data.progress_ms || 0,
      durationMs: data.item.duration_ms,
      shuffleState: data.shuffle_state,
      repeatState: data.repeat_state,
      device: data.device
        ? {
            id: data.device.id,
            name: data.device.name,
            type: data.device.type,
            volumePercent: data.device.volume_percent,
          }
        : null,
    };
  } catch (err) {
    // 204 or empty response, no active playback
    if (err instanceof SpotifyApiError && err.status === 204) {
      return {
        isPlaying: false,
        track: null,
        progressMs: 0,
        durationMs: 0,
        shuffleState: false,
        repeatState: "off",
        device: null,
      };
    }
    throw err;
  }
}

/**
 * Control playback: play, pause, next, previous, shuffle.
 */
export async function controlPlayback(
  token: string,
  action: "play" | "pause" | "next" | "previous" | "shuffle_on" | "shuffle_off"
): Promise<void> {
  switch (action) {
    case "play":
      await spotifyFetch(`${SPOTIFY_API}/me/player/play`, token, {
        method: "PUT",
      });
      break;
    case "pause":
      await spotifyFetch(`${SPOTIFY_API}/me/player/pause`, token, {
        method: "PUT",
      });
      break;
    case "next":
      await spotifyFetch(`${SPOTIFY_API}/me/player/next`, token, {
        method: "POST",
      });
      break;
    case "previous":
      await spotifyFetch(`${SPOTIFY_API}/me/player/previous`, token, {
        method: "POST",
      });
      break;
    case "shuffle_on":
      await spotifyFetch(
        `${SPOTIFY_API}/me/player/shuffle?state=true`,
        token,
        { method: "PUT" }
      );
      break;
    case "shuffle_off":
      await spotifyFetch(
        `${SPOTIFY_API}/me/player/shuffle?state=false`,
        token,
        { method: "PUT" }
      );
      break;
  }
}

/**
 * Search Spotify for tracks, artists, albums, or playlists.
 */
export async function searchSpotify(
  token: string,
  query: string,
  type: "track" | "artist" | "album" | "playlist" = "track"
): Promise<SpotifySearchResults> {
  const url = new URL(`${SPOTIFY_API}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("type", type);
  url.searchParams.set("limit", "10");

  const data = await spotifyFetch<{
    tracks?: { items: RawTrack[] };
    artists?: { items: RawArtist[] };
    albums?: { items: RawAlbum[] };
    playlists?: {
      items: {
        id: string;
        name: string;
        images: SpotifyImage[];
        owner: { display_name: string };
        uri: string;
      }[];
    };
  }>(url.toString(), token);

  return {
    tracks: data.tracks?.items.map(parseTrack) || [],
    artists:
      data.artists?.items.map((a) => ({
        id: a.id,
        name: a.name,
        images: a.images || [],
        uri: a.uri,
      })) || [],
    albums:
      data.albums?.items.map((a) => ({
        id: a.id,
        name: a.name,
        images: a.images,
        artists: a.artists?.map((ar) => ar.name) || [],
        uri: a.uri,
      })) || [],
    playlists:
      data.playlists?.items
        .filter(Boolean)
        .map((p) => ({
          id: p.id,
          name: p.name,
          images: p.images,
          owner: p.owner.display_name,
          uri: p.uri,
        })) || [],
  };
}

/**
 * Add a track to the user's queue.
 */
export async function addToQueue(
  token: string,
  trackUri: string
): Promise<void> {
  const url = new URL(`${SPOTIFY_API}/me/player/queue`);
  url.searchParams.set("uri", trackUri);

  await spotifyFetch(url.toString(), token, {
    method: "POST",
  });
}

/**
 * Fetch user's playlists.
 */
export async function fetchPlaylists(
  token: string
): Promise<SpotifyPlaylist[]> {
  const data = await spotifyFetch<{
    items: {
      id: string;
      name: string;
      description: string | null;
      images: SpotifyImage[];
      owner: { display_name: string };
      tracks: { total: number };
      uri: string;
      public: boolean;
    }[];
  }>(`${SPOTIFY_API}/me/playlists?limit=50`, token);

  return data.items.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    images: p.images,
    owner: p.owner.display_name,
    trackCount: p.tracks.total,
    uri: p.uri,
    isPublic: p.public,
  }));
}

/**
 * Fetch user's top tracks.
 */
export async function fetchTopTracks(
  token: string,
  timeRange: "short_term" | "medium_term" | "long_term" = "medium_term"
): Promise<SpotifyTrack[]> {
  const data = await spotifyFetch<{ items: RawTrack[] }>(
    `${SPOTIFY_API}/me/top/tracks?time_range=${timeRange}&limit=20`,
    token
  );

  return data.items.map(parseTrack);
}

/**
 * Fetch recently played tracks.
 */
export async function fetchRecentlyPlayed(
  token: string
): Promise<{ track: SpotifyTrack; playedAt: string }[]> {
  const data = await spotifyFetch<{
    items: { track: RawTrack; played_at: string }[];
  }>(`${SPOTIFY_API}/me/player/recently-played?limit=20`, token);

  return data.items.map((item) => ({
    track: parseTrack(item.track),
    playedAt: item.played_at,
  }));
}
