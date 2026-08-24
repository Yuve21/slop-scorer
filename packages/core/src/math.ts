/** Log-odds helpers. Kept separate so the scoring math is testable without a Report. */

export const logit = (p: number): number => Math.log(p / (1 - p));

export const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Harmonic multiplicity. The kth piece of evidence for the SAME rule contributes w/k.
 *
 * Ten `<img>` tags missing alt text are not ten independent observations, they are one
 * observation with a count. Diminishing returns is the difference between "this page has a
 * defect" and "this page has a defect ten times so it must be ten times more generated".
 */
export const multiplicity = (hits: number): number => {
  let sum = 0;
  for (let i = 1; i <= hits; i += 1) sum += 1 / i;
  return sum;
};

/**
 * Position decay WITHIN a family. Findings are sorted strongest first; finding at
 * 1-based position j contributes w/j.
 *
 * Same argument one level up: rules inside a family observe overlapping facts about the
 * same artifact, so the family's second and third rules are corroboration, not new
 * information.
 */
export const positionDecay = (position1Based: number): number => 1 / position1Based;
