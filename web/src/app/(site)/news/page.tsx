import type { Metadata } from "next";
import { InfoPage } from "@/components/InfoPage";
import { NEWS } from "@/lib/news";

export const metadata: Metadata = { title: "News | elevn" };

const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export default function News() {
  return (
    <InfoPage title="What's new at elevn" intro="Updates on the game, the token and the road to launch.">
      <div className="divide-y divide-line">
        {NEWS.map((p) => (
          <article key={p.date + p.title} className="py-8 first:pt-0">
            <div className="flex items-center gap-3 text-xs">
              <span className="rounded-full bg-wash px-2.5 py-1 font-semibold text-link">{p.tag}</span>
              <time dateTime={p.date} className="text-muted">{day(p.date)}</time>
            </div>
            <h2 className="mt-3 text-xl font-bold">{p.title}</h2>
            <p className="mt-2 max-w-[65ch] leading-relaxed text-muted">{p.body}</p>
          </article>
        ))}
      </div>
    </InfoPage>
  );
}
