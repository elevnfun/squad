// The builder's money check, without a browser: can the open places still be filled with what is left?
import { expect, test } from "@playwright/test";
import type { Player, Position } from "../src/lib/api";
import { cheapestFill, cannotFinish } from "../src/lib/squad";

const player = (id: number, position: Position, price: number): Player => ({
  id, name: `P${id}`, position, price, club: { id: id % 7, name: `Club ${id % 7}`, logo: null },
  photo: null, points: 0, appearances: 0, form: null, status: null, status_reason: null,
});
const POOL = [player(1, "FWD", 15), player(2, "FWD", 4.8), player(3, "FWD", 5.5), player(4, "FWD", 7),
  player(5, "MID", 4.5), player(6, "MID", 5)];

test("the cheapest fill takes the cheapest unpicked players for each open place", () => {
  expect(cheapestFill(POOL, new Set([1]), ["FWD", "FWD"])).toBeCloseTo(10.3);         // 4.8 + 5.5
  expect(cheapestFill(POOL, new Set([1, 2]), ["FWD", "MID"])).toBeCloseTo(10);         // 5.5 + 4.5
  expect(cheapestFill(POOL, new Set(), [])).toBe(0);
});

test("a squad that can't be finished is flagged, one that can is not", () => {
  // Haaland bought: 5.6M left for two attackers, the cheapest pair costs 10.3M
  expect(cannotFinish(5.6, 10.3)).toBe(true);
  expect(cannotFinish(10.3, 10.3)).toBe(false);                                        // exactly enough
  expect(cannotFinish(0.1 + 0.2, 0.3)).toBe(false);                                    // no float noise
});
