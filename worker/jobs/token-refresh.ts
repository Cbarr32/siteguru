/**
 * worker/jobs/token-refresh.ts
 * ────────────────────────────
 * Finds OAuth accounts with tokens expiring within 10 minutes
 * and refreshes them using each provider's token endpoint.
 *
 * Provider refresh endpoints:
 *  - Google:    https://oauth2.googleapis.com/token
 *  - Spotify:   https://accounts.spotify.com/api/token
 *  - Microsoft: https://login.microsoftonline.com/common/oauth2/v2.0/token
 *  - GitHub:    tokens don't expire — skip
 *  - Facebook:  long-lived tokens — skip
 */

import getDb from "../lib/db";

// ─── Provider config ────────────────────────────────────────────

interface ProviderConfig {
  tokenUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  google: {
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  },
  spotify: {
    tokenUrl: "https://accounts.spotify.com/api/token",
    clientIdEnv: "SPOTIFY_CLIENT_ID",
    clientSecretEnv: "SPOTIFY_CLIENT_SECRET",
  },
  "microsoft-entra-id": {
    tokenUrl:
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    clientIdEnv: "MICROSOFT_ENTRA_ID_CLIENT_ID",
    clientSecretEnv: "MICROSOFT_ENTRA_ID_CLIENT_SECRET",
  },
};

// ─── Main ───────────────────────────────────────────────────────

export async function refreshTokens(): Promise<void> {
  const db = getDb();

  // Find accounts that expire within the next 10 minutes
  // expires_at is stored as seconds since epoch (NextAuth convention)
  const tenMinutesFromNow = Math.floor(Date.now() / 1000) + 10 * 60;

  const expiringAccounts = await db.account.findMany({
    where: {
      expires_at: { lte: tenMinutesFromNow },
      refresh_token: { not: null },
      provider: { in: Object.keys(PROVIDERS) },
    },
    select: {
      id: true,
      provider: true,
      refresh_token: true,
      access_token: true,
      expires_at: true,
      userId: true,
    },
  });

  if (!expiringAccounts.length) {
    console.log("[token-refresh] No tokens need refreshing");
    return;
  }

  console.log(
    `[token-refresh] Refreshing ${expiringAccounts.length} token(s)…`
  );

  const results = await Promise.allSettled(
    expiringAccounts.map((account) => refreshSingleToken(db, account))
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  console.log(
    `[token-refresh] Done: ${succeeded} refreshed, ${failed} failed`
  );
}

// ─── Single token refresh ───────────────────────────────────────

async function refreshSingleToken(
  db: ReturnType<typeof getDb>,
  account: {
    id: string;
    provider: string;
    refresh_token: string | null;
    access_token: string | null;
    expires_at: number | null;
    userId: string;
  }
): Promise<void> {
  const config = PROVIDERS[account.provider];
  if (!config || !account.refresh_token) return;

  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];

  if (!clientId || !clientSecret) {
    console.warn(
      `[token-refresh] Missing credentials for ${account.provider}`
    );
    return;
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: account.refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `${account.provider} refresh failed (${res.status}): ${text.slice(0, 200)}`
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in?: number;
    refresh_token?: string;
    token_type?: string;
    scope?: string;
  };

  // Update the account record
  await db.account.update({
    where: { id: account.id },
    data: {
      access_token: data.access_token,
      expires_at: data.expires_in
        ? Math.floor(Date.now() / 1000) + data.expires_in
        : account.expires_at,
      // Some providers rotate refresh tokens (e.g. Google sometimes does)
      ...(data.refresh_token
        ? { refresh_token: data.refresh_token }
        : {}),
      ...(data.token_type ? { token_type: data.token_type } : {}),
      ...(data.scope ? { scope: data.scope } : {}),
    },
  });

  console.log(
    `[token-refresh] ✓ ${account.provider} refreshed for user ${account.userId}`
  );
}
