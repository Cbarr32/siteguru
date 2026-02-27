"use client";

import React, { useEffect, useState, useCallback } from "react";
import { BasePanel } from "@/components/panels/BasePanel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Newspaper,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface NewsArticle {
  id: string;
  title: string;
  link: string;
  description?: string;
  author?: string;
  publishedAt?: string;
  imageUrl?: string;
  feedSource: {
    name: string;
    category: string;
  };
}

interface NewsFeed {
  id: string;
  name: string;
  category: string;
  articleCount: number;
}

interface NewsPanelProps {
  id: string;
  onRemove?: (id: string) => void;
  onToggleExpand?: (id: string) => void;
  isExpanded?: boolean;
  defaultCategory?: string;
}

const CATEGORIES = ["all", "general", "tech", "world", "science"];

export function NewsPanel({
  id,
  onRemove,
  onToggleExpand,
  isExpanded = false,
  defaultCategory = "all",
}: NewsPanelProps) {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [, setFeeds] = useState<NewsFeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState(defaultCategory);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (activeCategory !== "all") {
        params.set("category", activeCategory);
      }
      params.set("limit", "20");

      const res = await fetch(`/api/news?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch news");
      const data = await res.json();
      setArticles(data.articles || []);
      setFeeds(data.feeds || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error fetching news");
    } finally {
      setLoading(false);
    }
  }, [activeCategory]);

  useEffect(() => {
    fetchNews();
    // Refresh every 15 minutes
    const interval = setInterval(fetchNews, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchNews]);

  const categoryActions = (
    <div className="flex gap-0.5 mr-1">
      {CATEGORIES.map((cat) => (
        <Button
          key={cat}
          variant={activeCategory === cat ? "secondary" : "ghost"}
          size="sm"
          className="h-6 px-2 text-[10px] capitalize"
          onClick={() => setActiveCategory(cat)}
        >
          {cat}
        </Button>
      ))}
    </div>
  );

  return (
    <BasePanel
      id={id}
      title="News"
      icon={<Newspaper className="h-4 w-4" />}
      isLoading={loading}
      isExpanded={isExpanded}
      onRemove={onRemove}
      onToggleExpand={onToggleExpand}
      onRefresh={() => fetchNews()}
      headerActions={categoryActions}
    >
      {error ? (
        <div className="flex items-center justify-center h-full text-sm text-destructive">
          {error}
        </div>
      ) : (
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-2">
            {articles.length === 0 && !loading ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                No articles found. Configure your news feeds in settings.
              </div>
            ) : (
              articles.map((article) => (
                <article
                  key={article.id}
                  className="group rounded-md border p-3 transition-colors hover:bg-accent/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                          {article.feedSource.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground capitalize">
                          {article.feedSource.category}
                        </span>
                        {article.publishedAt && (
                          <span className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(new Date(article.publishedAt), {
                              addSuffix: true,
                            })}
                          </span>
                        )}
                      </div>
                      <a
                        href={article.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={article.title}
                        className="text-sm font-medium leading-snug hover:underline line-clamp-2"
                      >
                        {article.title}
                      </a>
                      {article.description && expandedArticle === article.id && (
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-3">
                          {article.description.replace(/<[^>]*>/g, "")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {article.description && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() =>
                            setExpandedArticle(
                              expandedArticle === article.id
                                ? null
                                : article.id
                            )
                          }
                        >
                          {expandedArticle === article.id ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </Button>
                      )}
                      <a
                        href={article.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Open ${article.title} in new tab`}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                      </a>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </ScrollArea>
      )}
    </BasePanel>
  );
}
