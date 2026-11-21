"use client";

import { useSearchParams } from "next/navigation";
import DraftView from "./DraftView";

// /draft shows the next Draft week; /draft?week=YYYY-MM-DD shows the week that starts on that Tuesday
export default function DraftPage() {
  const w = useSearchParams().get("week") ?? "";
  return <DraftView week={/^\d{4}-\d{2}-\d{2}$/.test(w) ? w : "next"} />;
}
