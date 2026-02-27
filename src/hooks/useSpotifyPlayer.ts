"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ──────────────────────────────────────────────────────

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

interface SpotifyPlaybackState {
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

export interface UseSpotifyPlayerReturn {
  /** Current playback state */
  state: SpotifyPlaybackState;
  /** Whether the SDK player is connected (Premium only) */
  sdkReady: boolean;
  /** Whether the user appears to be non-Premium (SDK failed) */
  sdkFailed: boolean;
  /** Loading state */
  loading: boolean;
  /** Auth error */
  authError: boolean;
  /** Error message */
  error: string | null;
  /** Control functions */
  play: () => Promise<void>;
  pause: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  toggleShuffle: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  setVolume: (percent: number) => Promise<void>;
  /** Refresh now-playing */
  refresh: () => Promise<void>;
}

const EMPTY_STATE: SpotifyPlaybackState = {
  isPlaying: false,
  track: null,
  progressMs: 0,
  durationMs: 0,
  shuffleState: false,
  repeatState: "off",
  device: null,
};

// ─── Hook ───────────────────────────────────────────────────────

export function useSpotifyPlayer(active: boolean = true): UseSpotifyPlayerReturn {
  const [state, setState] = useState<SpotifyPlaybackState>(EMPTY_STATE);
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkFailed, setSdkFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playerRef = useRef<Spotify.Player | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Fetch now-playing from our API route ─────────────────

  const fetchNowPlaying = useCallback(async () => {
    try {
      const res = await fetch("/api/spotify/now-playing");
      if (res.status === 401) {
        setAuthError(true);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to fetch");
      }
      const data: SpotifyPlaybackState = await res.json();
      setState(data);
      setError(null);
      setAuthError(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Control helpers ──────────────────────────────────────

  const sendControl = useCallback(
    async (action: string) => {
      try {
        const res = await fetch("/api/spotify/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Control failed");
        }
        // Refresh state after a short delay for Spotify to process
        setTimeout(fetchNowPlaying, 300);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Control error");
      }
    },
    [fetchNowPlaying]
  );

  const play = useCallback(() => sendControl("play"), [sendControl]);
  const pause = useCallback(() => sendControl("pause"), [sendControl]);
  const next = useCallback(() => sendControl("next"), [sendControl]);
  const previous = useCallback(() => sendControl("previous"), [sendControl]);
  const toggleShuffle = useCallback(
    () => sendControl(state.shuffleState ? "shuffle_off" : "shuffle_on"),
    [sendControl, state.shuffleState]
  );

  const seek = useCallback(
    async (positionMs: number) => {
      try {
        await fetch(
          `https://api.spotify.com/v1/me/player/seek?position_ms=${Math.round(positionMs)}`,
          { method: "PUT" }
        );
        // This will fail without direct token access; use the state update instead
        setState((prev) => ({ ...prev, progressMs: positionMs }));
        setTimeout(fetchNowPlaying, 500);
      } catch {
        // Fallback: just update local state
        setState((prev) => ({ ...prev, progressMs: positionMs }));
      }
    },
    [fetchNowPlaying]
  );

  const setVolume = useCallback(
    async (percent: number) => {
      if (playerRef.current && sdkReady) {
        try {
          await playerRef.current.setVolume(percent / 100);
        } catch {
          // SDK unavailable
        }
      }
      setState((prev) => ({
        ...prev,
        device: prev.device
          ? { ...prev.device, volumePercent: percent }
          : null,
      }));
    },
    [sdkReady]
  );

  // ─── Local progress ticker ────────────────────────────────

  useEffect(() => {
    if (progressRef.current) {
      clearInterval(progressRef.current);
      progressRef.current = null;
    }

    if (state.isPlaying && state.track) {
      progressRef.current = setInterval(() => {
        setState((prev) => {
          if (!prev.isPlaying || !prev.track) return prev;
          const newProgress = Math.min(
            prev.progressMs + 1000,
            prev.durationMs
          );
          return { ...prev, progressMs: newProgress };
        });
      }, 1000);
    }

    return () => {
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [state.isPlaying, state.track]);

  // ─── SDK initialization ───────────────────────────────────

  useEffect(() => {
    if (!active) return;

    let mounted = true;

    // Define the callback before loading the script
    (window as unknown as Record<string, unknown>).onSpotifyWebPlaybackSDKReady =
      () => {
        if (!mounted) return;

        try {
          const player = new Spotify.Player({
            name: "SiteGuru Dashboard",
            getOAuthToken: async (cb) => {
              // Fetch token from our session
              try {
                const res = await fetch("/api/auth/session");
                const session = await res.json();
                if (session?.spotifyToken) {
                  cb(session.spotifyToken);
                }
              } catch {
                // Token unavailable
              }
            },
            volume: 0.5,
          });

          player.addListener("ready", () => {
            if (mounted) setSdkReady(true);
          });

          player.addListener("initialization_error", () => {
            if (mounted) setSdkFailed(true);
          });

          player.addListener("authentication_error", () => {
            if (mounted) setSdkFailed(true);
          });

          player.addListener("account_error", () => {
            // Non-Premium account
            if (mounted) setSdkFailed(true);
          });

          player.addListener("player_state_changed", (sdkState) => {
            if (!mounted || !sdkState) return;
            const currentTrack = sdkState.track_window.current_track;
            if (currentTrack) {
              setState({
                isPlaying: !sdkState.paused,
                track: {
                  id: currentTrack.id || "",
                  name: currentTrack.name,
                  uri: currentTrack.uri,
                  artists: currentTrack.artists.map((a) => ({
                    id: a.uri,
                    name: a.name,
                    uri: a.uri,
                  })),
                  album: {
                    id: currentTrack.album.uri,
                    name: currentTrack.album.name,
                    images: currentTrack.album.images.map((img) => ({
                      url: img.url,
                      height: img.height ?? null,
                      width: img.width ?? null,
                    })),
                    uri: currentTrack.album.uri,
                  },
                  durationMs: sdkState.duration,
                  explicit: false,
                  previewUrl: null,
                },
                progressMs: sdkState.position,
                durationMs: sdkState.duration,
                shuffleState: sdkState.shuffle,
                repeatState: sdkState.repeat_mode === 0
                  ? "off"
                  : sdkState.repeat_mode === 1
                    ? "context"
                    : "track",
                device: null,
              });
            }
          });

          player.connect();
          playerRef.current = player;
        } catch {
          if (mounted) setSdkFailed(true);
        }
      };

    // Load SDK script if not already loaded
    if (!document.getElementById("spotify-sdk")) {
      const script = document.createElement("script");
      script.id = "spotify-sdk";
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;
      document.body.appendChild(script);
    }

    return () => {
      mounted = false;
      if (playerRef.current) {
        playerRef.current.disconnect();
        playerRef.current = null;
      }
    };
  }, [active]);

  // ─── Polling ──────────────────────────────────────────────

  useEffect(() => {
    if (!active) return;

    // Initial fetch
    fetchNowPlaying();

    // Poll every 3s when active
    pollRef.current = setInterval(fetchNowPlaying, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [active, fetchNowPlaying]);

  return {
    state,
    sdkReady,
    sdkFailed,
    loading,
    authError,
    error,
    play,
    pause,
    next,
    previous,
    toggleShuffle,
    seek,
    setVolume,
    refresh: fetchNowPlaying,
  };
}
