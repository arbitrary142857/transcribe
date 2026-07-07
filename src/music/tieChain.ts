export function findTiedChain(
  tiedToNext: ReadonlySet<number>,
  index: number,
): number[] {
  let tieStart = index;
  while (tieStart > 0 && tiedToNext.has(tieStart - 1)) {
    tieStart--;
  }

  let tieEnd = index;
  while (tiedToNext.has(tieEnd)) {
    tieEnd++;
  }

  const tiedIndices: number[] = [];
  for (let i = tieStart; i <= tieEnd; i++) {
    tiedIndices.push(i);
  }
  return tiedIndices;
}
