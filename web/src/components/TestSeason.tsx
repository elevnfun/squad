// The public test season runs on Solana devnet with free test tokens. Until the site points at mainnet,
// every page carries a thin bar saying so, so nobody takes the test tokens or prizes for real ones.
export const TEST_SEASON = !(process.env.NEXT_PUBLIC_SOLANA_RPC ?? "").includes("mainnet");

export default function TestSeasonBar() {
  if (!TEST_SEASON) return null;
  return (
    <>
      {/* room at the very end of the page, so the bar never covers the footer's last line; its height,
          --test-bar, is set in globals.css while this bar is on the page */}
      <div aria-hidden="true" className="h-[var(--test-bar)] bg-black" />
      <p role="note" className="test-season-bar fixed inset-x-0 bottom-0 z-30 flex h-[var(--test-bar)] items-center justify-center gap-1.5 border-t border-accent/25 bg-bg/90 px-4 text-center text-[12px] text-muted backdrop-blur-md">
        <span className="font-semibold text-accent">Test season</span>
        <span className="hidden sm:inline">on devnet. Tokens and prizes have no real value, and $ELEVN isn&apos;t launched yet.</span>
        <span className="sm:hidden">on devnet. No real value.</span>
      </p>
    </>
  );
}
