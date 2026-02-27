"use client";

import React, { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  GripVertical,
  Maximize2,
  Minimize2,
  X,
  RotateCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface BasePanelProps {
  id: string;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  isLoading?: boolean;
  isExpanded?: boolean;
  onRemove?: (id: string) => void;
  onToggleExpand?: (id: string) => void;
  onRefresh?: (id: string) => void;
  headerActions?: ReactNode;
}

export function BasePanel({
  id,
  title,
  icon,
  children,
  className,
  isLoading = false,
  isExpanded = false,
  onRemove,
  onToggleExpand,
  onRefresh,
  headerActions,
}: BasePanelProps) {
  return (
    <Card
      className={cn(
        "flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md",
        isExpanded && "col-span-2 row-span-2",
        className
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 pt-3">
        <div className="flex items-center gap-2">
          <div className="drag-handle cursor-grab active:cursor-grabbing">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          {icon && (
            <span className="text-muted-foreground">{icon}</span>
          )}
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </div>
        <div className="flex items-center gap-1">
          {headerActions}
          {onRefresh && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onRefresh(id)}
              disabled={isLoading}
            >
              <RotateCw
                className={cn("h-3.5 w-3.5", isLoading && "animate-spin")}
              />
            </Button>
          )}
          {onToggleExpand && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onToggleExpand(id)}
            >
              {isExpanded ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
          {onRemove && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:text-destructive"
              onClick={() => onRemove(id)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto px-4 pb-4 pt-0">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <RotateCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
