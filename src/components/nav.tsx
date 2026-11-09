"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

const LINKS = [
  { href: "/", label: "Search" },
  { href: "/candidates", label: "Candidates" },
  { href: "/upload", label: "Upload CVs" },
  { href: "/imports", label: "Import log" },
];

function NavLinks({ pathname }: { pathname: string | null }) {
  const isActive = (href: string) =>
    pathname != null && (href === "/" ? pathname === "/" || pathname.startsWith("/search") : pathname.startsWith(href));

  return (
    <>
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`whitespace-nowrap rounded-md px-3 py-1.5 transition-colors ${
            isActive(l.href)
              ? "bg-accent-soft font-medium text-accent"
              : "text-muted hover:bg-surface-muted hover:text-foreground"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </>
  );
}

function ActiveNavLinks() {
  return <NavLinks pathname={usePathname()} />;
}

export function Nav() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-sm text-white">CV</span>
          <span className="hidden sm:inline">CV Search</span>
        </Link>
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto text-sm">
          <Suspense fallback={<NavLinks pathname={null} />}>
            <ActiveNavLinks />
          </Suspense>
        </nav>
        <form action="/auth/signout" method="post">
          <button className="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-surface-muted hover:text-foreground">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
