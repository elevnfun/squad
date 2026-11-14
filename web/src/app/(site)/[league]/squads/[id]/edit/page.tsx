import { redirect } from "next/navigation";

// Picking players now happens on the squad page's Pick team tab.
export default async function Edit({ params }: { params: Promise<{ league: string; id: string }> }) {
  const { league, id } = await params;
  redirect(`/${league}/squads/${id}?tab=pick`);
}
