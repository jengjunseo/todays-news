"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export const NAV_ITEMS = [
  { href: "/", label: "오늘" },
  { href: "/archive", label: "지난 뉴스" },
  { href: "/insights", label: "생각" },
  { href: "/settings", label: "설정" },
] as const;

export function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav" aria-label="주요 메뉴">
      <div className="bottom-nav__inner">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? pathname === item.href
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className="nav-link"
              data-active={active}
              aria-current={active ? "page" : undefined}
            >
              <NavLabel href={item.href} label={item.label} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function NavLabel({ href, label }: { href: string; label: string }) {
  const { pending } = useLinkStatus();
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (pending && startedAt.current === null) {
      startedAt.current = performance.now();
      console.log(JSON.stringify({
        stage: "navigation_started",
        fromPath: window.location.pathname,
        toPath: href,
      }));
      return;
    }
    if (!pending && startedAt.current !== null) {
      console.log(JSON.stringify({
        stage: "navigation_completed",
        toPath: href,
        elapsedMs: Math.round(performance.now() - startedAt.current),
      }));
      startedAt.current = null;
    }
  }, [href, pending]);

  return <span className="nav-label" data-pending={pending}>{label}</span>;
}
