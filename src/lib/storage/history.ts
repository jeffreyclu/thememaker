/**
 * Pure helpers for the bounded scheme-history queue (most-recent at the end).
 *
 * Nothing here touches `chrome.*`; storage persists the array these produce, and
 * the popup reads entries back out. Both helpers are immutable (return new
 * values, never mutate their inputs).
 */
import { MAX_HISTORY } from "../../config";
import type { Scheme } from "../../types";

/**
 * Appends `scheme` to a bounded history queue (most-recent at the end),
 * returning a NEW array (pure — no mutation of the input). Oldest entries are
 * dropped once the queue exceeds `max`.
 */
export const enqueueScheme = (
  history: Scheme[],
  scheme: Scheme,
  max: number = MAX_HISTORY,
): Scheme[] => {
  const next = [...history, scheme];
  while (next.length > max) {
    next.shift();
  }
  return next;
};

/**
 * @returns the scheme at `index`, or `null` if the index is out of range / the
 * history is empty.
 */
export const dequeueScheme = (
  history: Scheme[],
  index: number,
): Scheme | null => {
  if (index >= 0 && index < history.length) {
    return history[index];
  }
  return null;
};
