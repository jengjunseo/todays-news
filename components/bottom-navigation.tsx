"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
