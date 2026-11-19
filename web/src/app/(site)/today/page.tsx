import type { Metadata } from "next";
import TodayView from "./TodayView";

export const metadata: Metadata = { title: "Today · elevn" };

export default function TodayPage() {
  return <TodayView />;
}
