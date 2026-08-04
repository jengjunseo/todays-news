"use client";

import { useEffect, useMemo, useState } from "react";

import { NewsCard } from "@/components/news-card";
import type { DigestItemWithSources } from "@/lib/demo/digest";
import type { NewsCategory } from "@/lib/news/types";

const CATEGORY_LABEL: Record<NewsCategory, string> = {
  politics: "정치",
  society: "사회",
  science: "과학",
  technology: "IT·정보",
  economy: "경제",
};

export function DigestView({
  items,
  sourceDate,
  persistAsCurrent = true,
}: {
  items: DigestItemWithSources[];
  sourceDate: string;
  persistAsCurrent?: boolean;
}) {
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("yesterday-core:read") ?? "[]") as string[];
    queueMicrotask(() => setReadIds(new Set(stored)));
  }, []);

  useEffect(() => {
    if (!persistAsCurrent) return;
    localStorage.setItem(
      "yesterday-core:last-digest",
      JSON.stringify({
        sourceDate,
        items: items.map((item) => ({ id: item.id, category: item.category, headline: item.headline, oneLine: item.oneLine })),
      }),
    );
  }, [items, persistAsCurrent, sourceDate]);

  const progress = items.length === 0 ? 0 : Math.round((readIds.size / items.length) * 100);
  const grouped = useMemo(
    () =>
      Object.entries(CATEGORY_LABEL).map(([category, label]) => ({
        category: category as NewsCategory,
        label,
        items: items.filter((item) => item.category === category),
      })),
    [items],
  );

  function markRead(id: string) {
    setReadIds((current) => {
      const next = new Set(current).add(id);
      localStorage.setItem("yesterday-core:read", JSON.stringify([...next]));
      return next;
    });
    void fetch("/api/read-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ digestItemId: id }),
    });
  }

  return (
    <>
      <section className="progress-block" aria-label={`읽기 진행률 ${progress}%`}>
        <div className="progress-meta">
          <span>오늘 읽기</span>
          <span>{Math.min(readIds.size, items.length)} / {items.length}</span>
        </div>
        <div className="progress-track" aria-hidden="true">
          <div className="progress-value" style={{ width: `${progress}%` }} />
        </div>
      </section>

      <div className="category-list">
        {grouped.map((group) =>
          group.items.length ? (
            <section key={group.category} className="category-section" aria-labelledby={`category-${group.category}`}>
              <h2 id={`category-${group.category}`}>{group.label}</h2>
              <div className="news-list">
                {group.items.map((item) => (
                  <NewsCard
                    key={item.id}
                    item={item}
                    categoryLabel={group.label}
                    read={readIds.has(item.id)}
                    onOpen={() => markRead(item.id)}
                  />
                ))}
              </div>
            </section>
          ) : null,
        )}
      </div>
    </>
  );
}
