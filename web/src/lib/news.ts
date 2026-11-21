// News posts for /news, newest first. Add a post by putting a new entry at the top.
export type NewsPost = { date: string; tag: string; title: string; body: string };

export const NEWS: NewsPost[] = [
  {
    date: "2026-11-04", tag: "Update", title: "A new look for elevn",
    body: "The site has a new night-match design: near-black and trophy gold. Pages for About, How to play, the Roadmap and the FAQ are up too.",
  },
  {
    date: "2026-11-03", tag: "Token", title: "Meet $ELEVN",
    body: "The game's token is called $ELEVN. Hold 150,000 $ELEVN to play Matchday Blitz, or 300,000 to play Draft too, with no entry fees.",
  },
  {
    date: "2026-11-02", tag: "Testing", title: "elevn is live on devnet",
    body: "The whole game now runs on Solana devnet with test tokens: Matchday Blitz, Draft, live scoring, leaderboards and prize payouts. We're testing every part before launch.",
  },
  {
    date: "2026-11-01", tag: "Prizes", title: "Prizes are paid in SOL",
    body: "Each week, 60% of $ELEVN's trading fees goes to prizes for the top 5 on each board, paid in SOL. Another 20% buys back $ELEVN and burns it.",
  },
];
