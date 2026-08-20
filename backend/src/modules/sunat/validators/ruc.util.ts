/**
 * RUC validation (SUNAT, Perú).
 *
 * A RUC is 11 digits: a 2-digit taxpayer-type prefix, an 8-digit body and a
 * check digit computed with the Módulo 11 algorithm.
 */

/** Prefixes SUNAT actually issues. 10/15/17 are natural persons, 20 legal entities. */
const VALID_RUC_PREFIXES = ['10', '15', '16', '17', '20'];

/** Weights applied to the first 10 digits, left to right (SUNAT Módulo 11). */
const MODULO_11_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/**
 * Validates an 11-digit RUC, check digit included.
 *
 * The same algorithm runs on the frontend (spec §2, Paso 1.3), but it is
 * repeated here because a client-side check is a UX affordance, not a
 * guarantee — the API is reachable directly.
 */
export function isValidRuc(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{11}$/.test(value)) {
    return false;
  }

  if (!VALID_RUC_PREFIXES.includes(value.slice(0, 2))) {
    return false;
  }

  const sum = MODULO_11_WEIGHTS.reduce(
    (acc, weight, index) => acc + weight * Number(value[index]),
    0,
  );

  // Módulo 11: the remainder maps to the check digit, with 10 -> 0 and 11 -> 1
  // (the two cases where 11 - remainder would not be a single digit).
  const remainder = 11 - (sum % 11);
  const checkDigit = remainder === 10 ? 0 : remainder === 11 ? 1 : remainder;

  return checkDigit === Number(value[10]);
}
