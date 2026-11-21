import type { Metadata } from "next";
import ShootoutView from "./ShootoutView";

export const metadata: Metadata = { title: "Penalty Shootout · elevn" };

export default function ShootoutPage() {
  return <ShootoutView />;
}
