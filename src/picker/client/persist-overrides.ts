/**
 * Serialized persistence of the picker's live theme onto this origin's saved
 * scheme — framework-agnostic IO the `useApplyOverrides` hook calls.
 *
 * Storage is the single source of truth: overrides + palette + intensity live on
 * the per-site `savedScheme`, so a reload restores the exact custom theme via
 * `loadDecision`. Writes are serialized through a tail promise (`persistQueue`)
 * so the read-modify-write cycles never interleave: a fast color-drag (each
 * `input` event → a persist) could otherwise fire overlapping read→merge→write
 * cycles and lose an update (last-writer-wins on a stale read). Chaining makes
 * each persist read after the previous one's write committed.
 *
 * A plain module-level queue (not React state): it is process-wide IO ordering,
 * decoupled from any component lifecycle.
 */
import { readSiteState, writeSiteState } from "../../content/site-storage";
import type { Palette } from "../../lib/palette";
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
  const site = (await readSiteState(origin)) ?? { enabled: false };
  // Drop any previously-saved `overrides` here so it can't linger: "no
  // overrides" is the absence of the key, re-added below only when there are some.
  const { overrides: _prevOverrides, ...prevDetails } =
    site.savedScheme?.schemeDetails ??
    ({
      rootColor: input.palette.seed,
      colorMode: input.palette.mode,
    } as Scheme["schemeDetails"]);
  const hasOverrides = Object.keys(input.overrides).length > 0;
  // Carry the live palette + intensity + overrides so `loadDecision` reapplies
  // the exact custom theme next load.
  const savedScheme: Scheme = {
    ...(site.savedScheme ?? {
      colors: {},
      schemeDetails: {} as Scheme["schemeDetails"],
    }),
    schemeDetails: {
      ...prevDetails,
      palette: input.palette,
      intensity: input.intensity,
      ...(hasOverrides ? { overrides: input.overrides } : {}),
    },
  };
  await writeSiteState(origin, { ...site, enabled: true, savedScheme });
};

let persistQueue: Promise<void> = Promise.resolve();

/**
 * Persists the live theme onto this origin's saved scheme, serialized via the
 * tail promise so overlapping edits can't lose an update. A failed persist must
 * not break the chain for the next one.
 */
export const persistOverrides = (input: PersistInput): Promise<void> => {
  persistQueue = persistQueue.then(() => persistOnce(input)).catch(() => {});
  return persistQueue;
};
