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
  { href: "/browse", label: "Browse" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <NavigationMenu>
      <NavigationMenuList className="flex-col sm:flex-row">
        {routes.map((route) => (
          <NavigationMenuItem key={route.href}>
            <Link href={route.href} legacyBehavior passHref>
              <NavigationMenuLink
                className={cn(
                  navigationMenuTriggerStyle(),
                  "font-press-start-2p text-sm w-full sm:w-auto text-center sm:text-left",
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
