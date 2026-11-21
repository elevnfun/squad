import type { Metadata } from "next";
import { Suspense } from "react";
import BankedView from "./BankedView";

export const metadata: Metadata = { title: "Banked · elevn" };

export default function BankedPage() {
  // useSearchParams (day and slot in the URL) needs a Suspense boundary
  return (
    <Suspense fallback={null}>
      <BankedView />
    </Suspense>
  );
}
