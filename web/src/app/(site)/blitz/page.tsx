import type { Metadata } from "next";
import BlitzView from "./BlitzView";

export const metadata: Metadata = { title: "Pick squads · elevn" };

export default function BlitzPage() {
  return <BlitzView />;
}
