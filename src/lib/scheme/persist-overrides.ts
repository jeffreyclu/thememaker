/**
 * Serialized persistence of the picker's live theme onto this origin's saved
 * scheme — the IO the `useApplyOverrides` hook calls.
 *
 * Storage is the single source of truth: overrides + palette + intensity live on
 * the per-site `savedScheme`, so a reload restores the exact custom theme via
 * `loadDecision`. Writes are serialized through a tail promise so the
 * read-modify-write cycles never interleave: a fast color-drag (each `input` event
 * → a persist) could otherwise fire overlapping read→merge→write cycles and lose
 * an update. A plain module-level queue (not React state) — process-wide IO
 * ordering, decoupled from any component lifecycle.
 */
import { storage } from "../storage";
import type { Palette } from "../palette";
import type { RoleOverrides, Scheme } from "../../types";

/** The live theme to persist: palette + intensity + the override map. */
export interface PersistInput {
  palette: Palette;
  intensity: number;
  overrides: RoleOverrides;
}

/** Read-modify-write of this origin's saved scheme from the live theme. */
const persistOnce = async (input: PersistInput): Promise<void> => {
  const origin = location.origin;
  const prev = (await storage.getSiteState(origin)).savedScheme;
  // Carry prior detail fields forward except `overrides` — "no overrides" is the
  // absence of the key, re-added below only when there are some.
  const prevDetails: Scheme["schemeDetails"] = prev?.schemeDetails ?? {
    rootColor: input.palette.seed,
    colorMode: input.palette.mode,
  };
  const { overrides: _drop, ...carried } = prevDetails;
  const hasOverrides = Object.keys(input.overrides).length > 0;
  const savedScheme: Scheme = {
    colors: prev?.colors ?? {},
    schemeDetails: {
      ...carried,
      palette: input.palette,
      intensity: input.intensity,
      ...(hasOverrides ? { overrides: input.overrides } : {}),
    },
  };
  await storage.setSiteState(origin, { enabled: true, savedScheme });
};

let persistQueue: Promise<void> = Promise.resolve();

/**
 * Persists the live theme onto this origin's saved scheme, serialized via the tail
 * promise so overlapping edits can't lose an update. A failed persist must not
 * break the chain for the next one.
 */
export const persistOverrides = (input: PersistInput): Promise<void> => {
  persistQueue = persistQueue.then(() => persistOnce(input)).catch(() => {});
  return persistQueue;
};
