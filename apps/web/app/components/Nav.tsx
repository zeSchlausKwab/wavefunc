"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const routes = [
  { href: "/", label: "Home" },
  { href: "/discover", label: "Discover" },
  { href: "/favorites", label: "Favorites" },
  { href: "/add-station", label: "Add Station" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="bg-white bg-opacity-80 border-b">
      <div className="container mx-auto px-4 py-2">
        <ul className="flex space-x-4">
          {routes.map((route) => (
            <li key={route.href}>
              <Link
                href={route.href}
                className={cn(
                  "text-sm font-press-start-2p transition-colors hover:text-primary",
                  pathname === route.href ?
                    "text-primary font-medium"
                  : "text-muted-foreground"
                )}
              >
                {route.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
