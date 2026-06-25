/**
 * In-page floating picker control session.
 *
 * The popup sends SHOW_PICKER (carrying the live theme) then closes. We mount a
 * Shadow DOM panel and a RE-ARMING pick session: clicking page elements adds
 * override rows; editing a row's color (or clearing it) applies live + persists.
 * Storage is the source of truth — overrides live on the per-site savedScheme,
 * so a reload restores them via `loadDecision`. Esc / Done close the panel.
 */
import { startPick, type PickSession } from "./pick";
import {
  mountPickerPanel,
  PANEL_HOST_ID,
  type PanelHandle,
} from "./picker-panel";
import {
  withoutRole,
  withPickedRole,
  withRoleColor,
} from "./picker-panel-model";
import { engine } from "../../lib/engine";
import { readSiteState, writeSiteState } from "../site-storage";
import type { Palette } from "../../lib/palette";
import type { ApplyOptions, RoleOverrides, Scheme } from "../../types";

/** The single live floating-control session for this tab. */
interface PickerSession {
  panel: PanelHandle;
  pick: PickSession;
  palette: Palette;
  /** The live theme intensity (panel re-applies + persists at this value). */
  intensity: number;
  /** The live override map the panel renders + applies + persists. */
  overrides: RoleOverrides;
}
let picker: PickerSession | null = null;

/** The current options (intensity + overrides) for a re-apply. */
const optionsFor = (s: PickerSession): ApplyOptions =>
  Object.keys(s.overrides).length > 0
    ? { intensity: s.intensity, overrides: s.overrides }
    : { intensity: s.intensity };

/**
 * SERIALIZES persistence: a tail promise that each persist chains onto, so the
 * read-modify-write cycles never interleave. Without this, a fast color-drag
 * (each `input` event → a persist) could fire overlapping read→merge→write
 * cycles and lose an update (last-writer-wins on a STALE read). Chaining makes
 * each persist read AFTER the previous one's write committed.
 */
let persistQueue: Promise<void> = Promise.resolve();

/** Read-modify-write of this origin's saved scheme from the session's state. */
const persistSession = async (s: PickerSession): Promise<void> => {
  const origin = location.origin;
  const site = (await readSiteState(origin)) ?? { enabled: false };
  // Drop any previously-saved `overrides` here so it can't linger: "no
  // overrides" is the ABSENCE of the key (same convention as `optionsFor`),
  // re-added below only when there are some.
  const { overrides: _prevOverrides, ...prevDetails } =
    site.savedScheme?.schemeDetails ??
    ({
      rootColor: s.palette.seed,
      colorMode: s.palette.mode,
    } as Scheme["schemeDetails"]);
  const hasOverrides = Object.keys(s.overrides).length > 0;
  // Build/refresh the saved scheme: carry the live palette + intensity +
  // overrides so `loadDecision` reapplies the exact custom theme next load.
  const savedScheme: Scheme = {
    ...(site.savedScheme ?? {
      colors: {},
      schemeDetails: {} as Scheme["schemeDetails"],
    }),
    schemeDetails: {
      ...prevDetails,
      palette: s.palette,
      intensity: s.intensity,
      ...(hasOverrides ? { overrides: s.overrides } : {}),
    },
  };
  await writeSiteState(origin, { ...site, enabled: true, savedScheme });
};

/**
 * Applies the session's overrides LIVE (in-page engine) AND persists them into
 * this origin's saved scheme, ENABLING auto-reapply so a reload restores them.
 * Storage is the single source of truth the popup reads. The live apply is
 * immediate; the persist is SERIALIZED via {@link persistQueue} so overlapping
 * edits can't lose an update.
 */
const applyAndPersist = (s: PickerSession): Promise<void> => {
  engine.applyWhenReady(s.palette, optionsFor(s));
  // Chain onto the queue; a failed persist must not break the chain for the next.
  persistQueue = persistQueue.then(() => persistSession(s)).catch(() => {});
  return persistQueue;
};

/** Re-renders the panel rows from the current overrides (if the panel is open). */
const renderPicker = (): void => {
  picker?.panel.render(picker.overrides);
};

/** Esc closes the floating control (delegates to the panel's Done). */
const onPickerKey = (e: KeyboardEvent): void => {
  if (e.key === "Escape" && picker) {
    e.preventDefault();
    e.stopPropagation();
    hidePicker();
  }
};

/**
 * Shows the in-page floating control, mounting the Shadow DOM panel + a
 * re-arming pick session. Replaces any existing session. Seeds from the popup's
 * current theme (palette + intensity + overrides) so edits start from the live
 * look and persist back onto the per-site saved scheme.
 */
export const showPicker = (palette: Palette, options: ApplyOptions): void => {
  hidePicker();

  // The panel/pick handlers need to read + mutate the LIVE session state, but the
  // panel/pick handles don't exist until we build them — a chicken-and-egg. We
  // break it WITHOUT a placeholder cast: the handlers close over `session` (the
  // `const` declared below), which is assigned BEFORE any handler can fire
  // (handlers only run on later user interaction — past the TDZ). So `panel`/
  // `pick` are built with honest types and the session is assembled once,
  // complete.
  const panel = mountPickerPanel({
    onColorChange: (role, color) => {
      // Do NOT re-render here: rebuilding the rows would replace the
      // <input type="color"> the user is actively dragging, which closes the
      // native color dialog. The input already shows its own value — just
      // update the override and apply live.
      session.overrides = withRoleColor(session.overrides, role, color);
      void applyAndPersist(session);
    },
    onClearRole: (role) => {
      session.overrides = withoutRole(session.overrides, role);
      renderPicker();
      void applyAndPersist(session);
    },
    onClearAll: () => {
      session.overrides = {};
      renderPicker();
      void applyAndPersist(session);
    },
    onDone: () => hidePicker(),
  });

  const pick = startPick({
    onPicked: (key, currentColor) => {
      session.overrides = withPickedRole(session.overrides, key, currentColor);
      renderPicker();
      void applyAndPersist(session);
    },
    // The panel host (and everything inside its shadow root) is excluded so the
    // control never highlights or recolors itself.
    isExcluded: (el) => el.closest(`#${PANEL_HOST_ID}`) !== null,
  });

  const session: PickerSession = {
    palette,
    intensity: options.intensity,
    overrides: { ...(options.overrides ?? {}) },
    panel,
    pick,
  };

  picker = session;
  panel.render(session.overrides);
  document.addEventListener("keydown", onPickerKey, true);
};

/** Hides the floating control + ends pick mode (idempotent). */
export const hidePicker = (): void => {
  if (!picker) {
    return;
  }
  document.removeEventListener("keydown", onPickerKey, true);
  picker.pick.stop();
  picker.panel.destroy();
  picker = null;
};

/**
 * Re-applies the theme in place (popup → content, e.g. after "Clear all" in the
 * popup) and, if the floating control is open, keeps its rows in sync.
 */
export const applyLive = (palette: Palette, options: ApplyOptions): void => {
  engine.applyWhenReady(palette, options);
  if (picker) {
    picker.palette = palette;
    picker.intensity = options.intensity;
    picker.overrides = { ...(options.overrides ?? {}) };
    renderPicker();
  }
};
