// Three-letter club codes for fixtures (ARS, MCI, MUN): the first three letters of the name, or,
// when two clubs share a first word (Manchester City, Manchester United), its first letter and
// the next word's first two.
export function clubCodes(names: string[]) {
  const all = [...new Set(names)];
  const first = (n: string) => n.split(" ")[0];
  const shared = new Set(all.map(first).filter((w, i, a) => a.indexOf(w) !== i));
  return new Map(all.map((n) => {
    const words = n.replace(/[^\p{L}\s]/gu, "").split(/\s+/).filter(Boolean);
    const code = shared.has(first(n)) && words[1] ? words[0][0] + words[1].slice(0, 2) : (words[0] ?? n).slice(0, 3);
    return [n, code.toUpperCase()];
  }));
}
