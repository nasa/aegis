/** Deterministic Park–Miller PRNG returning values in [0, 1). */
export function createSeededRandom(seed: number): () => number {
  let state = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}
