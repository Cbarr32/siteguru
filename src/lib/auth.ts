import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Spotify from "next-auth/providers/spotify";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/gmail.send",
            "https://www.googleapis.com/auth/gmail.modify",
            "https://www.googleapis.com/auth/youtube.readonly",
          ].join(" "),
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "read:user repo notifications",
        },
      },
    }),
    Spotify({
      clientId: process.env.SPOTIFY_CLIENT_ID!,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            "streaming",
            "user-read-playback-state",
            "user-modify-playback-state",
            "user-read-currently-playing",
            "playlist-read-private",
            "user-library-read",
            "user-top-read",
            "user-read-recently-played",
          ].join(" "),
        },
      },
    }),
  ],
  session: {
    strategy: "database",
  },
  callbacks: {
    async session({ session, user }) {
      // Attach access tokens to the session so API routes can use them
      if (user) {
        session.user.id = user.id;

        // Get the Google account for this user (Gmail)
        const googleAccount = await prisma.account.findFirst({
          where: {
            userId: user.id,
            provider: "google",
          },
        });

        if (googleAccount?.access_token) {
          (session as SessionWithAccessToken).accessToken =
            googleAccount.access_token;
        }

        // Get the GitHub account for this user
        const githubAccount = await prisma.account.findFirst({
          where: {
            userId: user.id,
            provider: "github",
          },
        });

        if (githubAccount?.access_token) {
          (session as SessionWithAccessToken).githubToken =
            githubAccount.access_token;
        }

        // Get the Spotify account for this user
        const spotifyAccount = await prisma.account.findFirst({
          where: {
            userId: user.id,
            provider: "spotify",
          },
        });

        if (spotifyAccount?.access_token) {
          (session as SessionWithAccessToken).spotifyToken =
            spotifyAccount.access_token;
        }
      }
      return session;
    },
  },
});

/** Extended session type that includes OAuth access tokens */
export interface SessionWithAccessToken {
  accessToken?: string;
  githubToken?: string;
  spotifyToken?: string;
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  expires: string;
}
