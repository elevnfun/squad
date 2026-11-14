"use client";

// Every page of the full site arrives with the same short fade (globals.css .page-enter), so moving
// between pages feels like one site rather than separate screens. The home page has its own intro and
// skips it. Opacity only: a transform here would pin fixed-position children (the intro cover, sheets)
// to this box instead of the screen.
import { usePathname } from "next/navigation";

export default function SiteTemplate({ children }: { children: React.ReactNode }) {
  const home = usePathname() === "/";
  return <div className={home ? undefined : "page-enter"}>{children}</div>;
}
