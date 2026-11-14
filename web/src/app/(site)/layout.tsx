import "@solana/wallet-adapter-react-ui/styles.css";
import Providers from "@/components/Providers";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SideRays from "@/components/side-rays/SideRays";
import TestSeasonBar from "@/components/TestSeason";

// The full site: nav, footer, wallet sign-in and the SideRays light. The teaser (app/teaser) has none of these.
export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {/* the site's background: React Bits' SideRays, gold light falling in from the top right, behind everything */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
        <SideRays rayColor1="#f2c14e" rayColor2="#fff1c9" blend={0.45} origin="top-right" speed={1.6} intensity={1.5}
          spread={2} density={5} sharpness={0.45} falloff={1.4} glow={0.7} opacity={0.85} followMouse mouseInfluence={0.16} />
      </div>
      <Providers>
        <Header />
        <main className="mx-auto w-full max-w-[1360px] px-6 pb-24 lg:px-20">{children}</main>
        <Footer />
        <TestSeasonBar />
      </Providers>
    </>
  );
}
