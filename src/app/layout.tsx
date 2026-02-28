import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { AgentProvider } from "@/components/agent/AgentContext";
import { AgentPanel, AgentFAB } from "@/components/agent/AgentPanel";
import { CommandPaletteProvider } from "@/components/agent/CommandPaletteProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "SiteGuru - Personal Dashboard",
  description:
    "A customizable personal dashboard with weather, news, and more.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          inter.variable
        )}
      >
        <AgentProvider>
          {children}
          <AgentPanel />
          <AgentFAB />
          <CommandPaletteProvider />
        </AgentProvider>
      </body>
    </html>
  );
}
