import type { Metadata } from "next";
import WinningsView from "./WinningsView";

export const metadata: Metadata = { title: "Winnings · elevn" };

export default function WinningsPage() {
  return <WinningsView />;
}
