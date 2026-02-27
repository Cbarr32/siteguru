"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  Cloud,
  Newspaper,
  Settings,
  ChevronLeft,
  ChevronRight,
  Plus,
  Globe,
} from "lucide-react";

interface NavItem {
  title: string;
  href: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/",
    icon: <LayoutDashboard className="h-5 w-5" />,
  },
  {
    title: "Weather",
    href: "/weather",
    icon: <Cloud className="h-5 w-5" />,
  },
  {
    title: "News",
    href: "/news",
    icon: <Newspaper className="h-5 w-5" />,
  },
  {
    title: "Browse",
    href: "/browse",
    icon: <Globe className="h-5 w-5" />,
  },
];

const bottomNavItems: NavItem[] = [
  {
    title: "Settings",
    href: "/settings",
    icon: <Settings className="h-5 w-5" />,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex h-screen flex-col border-r bg-background transition-all duration-300",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Logo / Brand */}
        <div className="flex h-14 items-center border-b px-4">
          {!collapsed && (
            <Link href="/" className="flex items-center gap-2">
              <Globe className="h-6 w-6 text-primary" />
              <span className="text-lg font-bold">SiteGuru</span>
            </Link>
          )}
          {collapsed && (
            <Link href="/" className="mx-auto">
              <Globe className="h-6 w-6 text-primary" />
            </Link>
          )}
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 py-4">
          <nav className="flex flex-col gap-1 px-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return collapsed ? (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>
                    <Link href={item.href}>
                      <Button
                        variant={isActive ? "secondary" : "ghost"}
                        size="icon"
                        className="w-full"
                      >
                        {item.icon}
                      </Button>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {item.title}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={isActive ? "secondary" : "ghost"}
                    className="w-full justify-start gap-3"
                  >
                    {item.icon}
                    <span>{item.title}</span>
                  </Button>
                </Link>
              );
            })}

            <Separator className="my-2" />

            {/* Add Panel button */}
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" className="w-full">
                    <Plus className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Add Panel</TooltipContent>
              </Tooltip>
            ) : (
              <Button variant="outline" className="w-full justify-start gap-3">
                <Plus className="h-5 w-5" />
                <span>Add Panel</span>
              </Button>
            )}
          </nav>
        </ScrollArea>

        {/* Bottom section */}
        <div className="border-t px-2 py-4">
          <nav className="flex flex-col gap-1">
            {bottomNavItems.map((item) => {
              const isActive = pathname === item.href;
              return collapsed ? (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>
                    <Link href={item.href}>
                      <Button
                        variant={isActive ? "secondary" : "ghost"}
                        size="icon"
                        className="w-full"
                      >
                        {item.icon}
                      </Button>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {item.title}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={isActive ? "secondary" : "ghost"}
                    className="w-full justify-start gap-3"
                  >
                    {item.icon}
                    <span>{item.title}</span>
                  </Button>
                </Link>
              );
            })}
          </nav>

          {/* Collapse toggle */}
          <Button
            variant="ghost"
            size={collapsed ? "icon" : "default"}
            className={cn("mt-2 w-full", !collapsed && "justify-start gap-3")}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <ChevronRight className="h-5 w-5" />
            ) : (
              <>
                <ChevronLeft className="h-5 w-5" />
                <span>Collapse</span>
              </>
            )}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
