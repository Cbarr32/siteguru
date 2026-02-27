"use client";

import React from "react";
import { BasePanel } from "./BasePanel";
import { ExternalLink, Music } from "lucide-react";

interface AppleMusicPanelProps {
  id: string;
}

export function AppleMusicPanel({ id }: AppleMusicPanelProps) {
  return (
    <BasePanel
      id={id}
      title="Apple Music"
      icon={<Music className="h-4 w-4" />}
    >
      <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
        {/* Apple Music icon */}
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FA2D48] via-[#FA233B] to-[#FB5C74]">
          <svg
            viewBox="0 0 24 24"
            className="h-9 w-9 text-white"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M23.994 6.124a9.23 9.23 0 0 0-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 0 0-1.877-.726 10.496 10.496 0 0 0-1.564-.15c-.073-.005-.148-.01-.22-.015H6.117c-.12.01-.24.015-.36.021a8.03 8.03 0 0 0-1.736.209C2.752.63 1.77 1.38 1.07 2.507a4.979 4.979 0 0 0-.56 1.49c-.13.58-.19 1.17-.21 1.76-.01.075-.01.15-.02.225v12.04c.01.09.01.18.02.27.02.59.08 1.18.22 1.76.33 1.37 1.14 2.38 2.34 3.07.5.28 1.04.47 1.61.58.57.11 1.15.17 1.73.19.1.01.19.01.29.02h11.72c.09-.01.18-.01.27-.02.6-.02 1.2-.08 1.79-.23 1.34-.34 2.33-1.12 3.02-2.3.3-.51.5-1.07.62-1.66.12-.58.18-1.17.2-1.76.01-.09.01-.17.02-.26V6.35c-.01-.08-.01-.15-.02-.23zM16.95 13.29l-.01 4.76c0 .47-.1.93-.33 1.35-.24.44-.6.79-1.07 1-.37.17-.77.25-1.17.25-.46 0-.9-.1-1.32-.35a1.83 1.83 0 0 1-.84-.93 1.74 1.74 0 0 1-.09-1.06c.1-.41.33-.75.68-1 .35-.25.73-.4 1.14-.48.41-.07.83-.14 1.24-.23.31-.07.47-.27.49-.59v-.02V9.97c0-.24-.16-.41-.4-.45l-.06-.01-5.17 1.12c-.04.01-.08.02-.12.04-.2.07-.31.23-.31.46v.04l-.01 5.85c0 .45-.09.89-.3 1.29-.24.47-.62.84-1.12 1.05-.38.16-.77.24-1.18.23-.45-.01-.88-.1-1.28-.34-.4-.24-.7-.58-.85-.99a1.7 1.7 0 0 1-.05-1.03c.1-.42.33-.77.69-1.02.34-.24.72-.39 1.12-.47.42-.08.84-.15 1.25-.24.3-.07.47-.27.48-.58V7.65c0-.12.02-.24.06-.35.1-.28.32-.44.6-.52l5.99-1.33c.34-.08.69-.13 1.03-.14.28 0 .5.18.54.46.02.09.02.19.02.28v7.25z" />
          </svg>
        </div>

        {/* Coming Soon message */}
        <div className="space-y-2 max-w-[240px]">
          <h3 className="text-sm font-semibold">Coming Soon</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Apple Music integration requires MusicKit JS setup with an Apple
            Developer account. This will be configured separately.
          </p>
        </div>

        {/* Documentation link */}
        <a
          href="https://developer.apple.com/documentation/musickitjs"
          target="_blank"
          rel="noopener noreferrer"
          title="MusicKit JS Documentation"
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          MusicKit JS Docs
        </a>
      </div>
    </BasePanel>
  );
}
