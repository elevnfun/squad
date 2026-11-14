import type { Metadata } from "next";
import { Suspense } from "react";
import SquadHub from "./SquadHub";

export async function generateMetadata({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ gw?: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { gw } = await searchParams;
  if (!gw) return {};
  const image = `/card/${id}/${gw}`;
  return {
    title: `Gameweek ${gw} on elevn`,
    openGraph: { images: [image] },
    twitter: { card: "summary_large_image", images: [image] },
  };
}

export default function Page() {
  return <Suspense><SquadHub /></Suspense>;
}
