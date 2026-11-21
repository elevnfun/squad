import type { Metadata } from "next";
import { Suspense } from "react";
import DraftPage from "./DraftPage";

export const metadata: Metadata = { title: "Draft · elevn" };

export default function Page() {
  // useSearchParams (the optional ?week=YYYY-MM-DD) needs a Suspense boundary
  return (
    <Suspense fallback={null}>
      <DraftPage />
    </Suspense>
  );
}
