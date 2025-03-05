"use client";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

const routes = [
  { href: "/discover", label: "Discover" },
  { href: "/genres", label: "Genres" },
  { href: "/browse", label: "Browse" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <NavigationMenu>
      <NavigationMenuList>
        {routes.map((route) => (
          <NavigationMenuItem key={route.href}>
            <Link href={route.href} legacyBehavior passHref>
              <NavigationMenuLink
                className={cn(
                  navigationMenuTriggerStyle(),
                  "font-press-start-2p text-sm",
                  pathname === route.href ?
                    "text-primary font-medium"
                  : "text-muted-foreground"
                )}
              >
                {route.label}
              </NavigationMenuLink>
            </Link>
          </NavigationMenuItem>
        ))}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
