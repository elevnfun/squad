import type { Metadata } from "next";
import { Suspense } from "react";
import RanksView from "./RanksView";

export const metadata: Metadata = { title: "Ranks · elevn" };

export default function RanksPage() {
  // useSearchParams (the tab in the URL) needs a Suspense boundary
  return (
    <Suspense fallback={null}>
      <RanksView />
    </Suspense>
  );
}
