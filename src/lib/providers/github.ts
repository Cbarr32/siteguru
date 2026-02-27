/**
 * GitHub API Provider
 *
 * Wraps the GitHub REST API v3 and GraphQL API v4 for activity feeds,
 * repository listing, notifications, contribution graphs, and profile info.
 *
 * Requires a valid OAuth2 access token scoped to:
 *   - read:user
 *   - repo
 *   - notifications
 */

const GITHUB_API = "https://api.github.com";
const GITHUB_GRAPHQL = "https://api.github.com/graphql";

// ─── Types ──────────────────────────────────────────────────────

export interface GitHubEvent {
  id: string;
  type: string;
  repo: string;
  description: string;
  createdAt: string;
}

export interface GitHubRepo {
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

export interface GitHubNotification {
  id: string;
  reason: string;
  title: string;
  repo: string;
  url: string;
  updatedAt: string;
  unread: boolean;
  type: string;
}

export interface ContributionDay {
  contributionCount: number;
  date: string;
  color: string;
}

export interface ContributionWeek {
  contributionDays: ContributionDay[];
}

export interface ContributionCalendar {
  totalContributions: number;
  weeks: ContributionWeek[];
}

export interface GitHubProfile {
  login: string;
  name: string | null;
  avatarUrl: string;
  bio: string | null;
  publicRepos: number;
  followers: number;
  following: number;
  url: string;
}

// ─── Error ──────────────────────────────────────────────────────

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

// ─── Helpers ────────────────────────────────────────────────────

async function ghFetch<T>(
  url: string,
  token: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new GitHubApiError(
      body.message || `GitHub API error: ${res.status}`,
      res.status
    );
  }

  return res.json() as Promise<T>;
}

// ─── Event parsing helpers ──────────────────────────────────────

type EventType = "all" | "commits" | "prs" | "issues";

interface RawEvent {
  id: string;
  type: string;
  repo: { name: string };
  payload: Record<string, unknown>;
  created_at: string;
}

function parseEventDescription(event: RawEvent): string {
  const { type, payload } = event;

  switch (type) {
    case "PushEvent": {
      const commits = payload.commits as { message: string }[] | undefined;
      const count = (payload.size as number) || commits?.length || 0;
      const msg = commits?.[0]?.message?.split("\n")[0] || "";
      return `Pushed ${count} commit${count !== 1 ? "s" : ""}${msg ? `: ${msg}` : ""}`;
    }
    case "PullRequestEvent": {
      const action = payload.action as string;
      const pr = payload.pull_request as { title: string } | undefined;
      return `${action} PR: ${pr?.title || ""}`;
    }
    case "IssuesEvent": {
      const action = payload.action as string;
      const issue = payload.issue as { title: string } | undefined;
      return `${action} issue: ${issue?.title || ""}`;
    }
    case "IssueCommentEvent": {
      const issue = payload.issue as { title: string } | undefined;
      return `Commented on: ${issue?.title || ""}`;
    }
    case "CreateEvent": {
      const refType = payload.ref_type as string;
      const ref = payload.ref as string | null;
      return `Created ${refType}${ref ? ` ${ref}` : ""}`;
    }
    case "DeleteEvent": {
      const refType = payload.ref_type as string;
      const ref = payload.ref as string;
      return `Deleted ${refType} ${ref}`;
    }
    case "WatchEvent":
      return "Starred repository";
    case "ForkEvent": {
      const forkee = payload.forkee as { full_name: string } | undefined;
      return `Forked to ${forkee?.full_name || ""}`;
    }
    case "ReleaseEvent": {
      const release = payload.release as { tag_name: string } | undefined;
      return `Released ${release?.tag_name || ""}`;
    }
    default:
      return type.replace("Event", "");
  }
}

function eventMatchesType(event: RawEvent, type: EventType): boolean {
  if (type === "all") return true;
  if (type === "commits") return event.type === "PushEvent";
  if (type === "prs") return event.type === "PullRequestEvent";
  if (type === "issues")
    return (
      event.type === "IssuesEvent" || event.type === "IssueCommentEvent"
    );
  return true;
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Fetch recent activity events for the authenticated user.
 */
export async function fetchActivity(
  token: string,
  type: EventType = "all",
  repo?: string
): Promise<GitHubEvent[]> {
  // First, get the authenticated user's login
  const profile = await ghFetch<{ login: string }>(
    `${GITHUB_API}/user`,
    token
  );

  const url = new URL(
    `${GITHUB_API}/users/${profile.login}/events`
  );
  url.searchParams.set("per_page", "100");

  const events = await ghFetch<RawEvent[]>(url.toString(), token);

  return events
    .filter((e) => eventMatchesType(e, type))
    .filter((e) => !repo || e.repo.name === repo)
    .slice(0, 30)
    .map((e) => ({
      id: e.id,
      type: e.type,
      repo: e.repo.name,
      description: parseEventDescription(e),
      createdAt: e.created_at,
    }));
}

/**
 * Fetch repositories for the authenticated user.
 */
export async function fetchRepos(
  token: string,
  sort: "updated" | "stars" | "pushed" = "updated"
): Promise<GitHubRepo[]> {
  const sortParam = sort === "stars" ? "full_name" : sort;
  const url = new URL(`${GITHUB_API}/user/repos`);
  url.searchParams.set("sort", sortParam);
  url.searchParams.set("direction", "desc");
  url.searchParams.set("per_page", "30");
  url.searchParams.set("type", "owner");

  interface RawRepo {
    id: number;
    name: string;
    full_name: string;
    description: string | null;
    language: string | null;
    stargazers_count: number;
    forks_count: number;
    html_url: string;
    private: boolean;
    updated_at: string;
    pushed_at: string;
  }

  const repos = await ghFetch<RawRepo[]>(url.toString(), token);

  const mapped = repos.map((r) => ({
    id: r.id,
    name: r.name,
    fullName: r.full_name,
    description: r.description,
    language: r.language,
    stars: r.stargazers_count,
    forks: r.forks_count,
    url: r.html_url,
    isPrivate: r.private,
    updatedAt: r.updated_at,
    pushedAt: r.pushed_at,
  }));

  // If sorting by stars, sort client-side since API sort param doesn't have "stars"
  if (sort === "stars") {
    mapped.sort((a, b) => b.stars - a.stars);
  }

  return mapped;
}

/**
 * Fetch unread notifications.
 */
export async function fetchNotifications(
  token: string
): Promise<GitHubNotification[]> {
  interface RawNotification {
    id: string;
    reason: string;
    subject: {
      title: string;
      url: string;
      type: string;
    };
    repository: {
      full_name: string;
    };
    updated_at: string;
    unread: boolean;
  }

  const notifications = await ghFetch<RawNotification[]>(
    `${GITHUB_API}/notifications?per_page=50`,
    token
  );

  return notifications.map((n) => ({
    id: n.id,
    reason: n.reason,
    title: n.subject.title,
    repo: n.repository.full_name,
    url: n.subject.url,
    updatedAt: n.updated_at,
    unread: n.unread,
    type: n.subject.type,
  }));
}

/**
 * Fetch contribution calendar (green squares) via GitHub GraphQL v4.
 */
export async function fetchContributionGraph(
  token: string,
  username: string
): Promise<ContributionCalendar> {
  const query = `query { user(login: "${username}") { contributionsCollection { contributionCalendar { totalContributions weeks { contributionDays { contributionCount date color } } } } } }`;

  interface GraphQLResponse {
    data: {
      user: {
        contributionsCollection: {
          contributionCalendar: ContributionCalendar;
        };
      };
    };
    errors?: { message: string }[];
  }

  const result = await ghFetch<GraphQLResponse>(GITHUB_GRAPHQL, token, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (result.errors?.length) {
    throw new GitHubApiError(
      result.errors[0].message,
      422
    );
  }

  return result.data.user.contributionsCollection.contributionCalendar;
}

/**
 * Fetch authenticated user profile.
 */
export async function fetchProfile(
  token: string
): Promise<GitHubProfile> {
  interface RawProfile {
    login: string;
    name: string | null;
    avatar_url: string;
    bio: string | null;
    public_repos: number;
    followers: number;
    following: number;
    html_url: string;
  }

  const profile = await ghFetch<RawProfile>(
    `${GITHUB_API}/user`,
    token
  );

  return {
    login: profile.login,
    name: profile.name,
    avatarUrl: profile.avatar_url,
    bio: profile.bio,
    publicRepos: profile.public_repos,
    followers: profile.followers,
    following: profile.following,
    url: profile.html_url,
  };
}
