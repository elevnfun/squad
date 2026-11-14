"use client";

// The launch teaser, what elevn.fun shows until the game is ready (src/middleware.ts): the intro video,
// then the big logo with "Not live yet" and the X and GitHub links. One screen, no scrolling.
import { useEffect } from "react";
import Intro from "@/components/intro/Intro";
import OpeningScreen from "@/components/OpeningScreen";

export default function Teaser() {
  useEffect(() => {
    document.documentElement.style.overflow = "hidden";
    return () => { document.documentElement.style.overflow = ""; };
  }, []);
  return (
    <div className="h-svh overflow-hidden">
      <Intro />
      <OpeningScreen teaser />
    </div>
  );
}
