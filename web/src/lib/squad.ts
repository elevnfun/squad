// Squad money checks the builder runs as you pick, before the API's full check on save.
import type { Player, Position } from "./api";

/** The least the open places can still cost: the cheapest players not yet picked, for each open place. */
export function cheapestFill(players: readonly Player[], picked: ReadonlySet<number>, open: readonly Position[]): number {
  const need = new Map<Position, number>();
  open.forEach((pos) => need.set(pos, (need.get(pos) ?? 0) + 1));
  let total = 0;
  for (const [pos, n] of need) {
    const prices = players.filter((p) => p.position === pos && !picked.has(p.id)).map((p) => p.price).sort((a, b) => a - b);
    total += prices.slice(0, n).reduce((sum, price) => sum + price, 0);
  }
  return total;
}

/** True when the money left can't pay for even the cheapest way to fill the open places (prices are in 0.1M steps). */
export function cannotFinish(left: number, leastToFill: number): boolean {
  return Math.round(left * 10) < Math.round(leastToFill * 10);
}
