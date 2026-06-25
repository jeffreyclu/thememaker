/**
 * One shared disclosure: a `<section>` with a `button.disclosure` toggle (aria
 * wired) and a collapsible panel (`hidden` when closed). Pure presentation — the
 * `expanded` flag + `onToggle` intent come from props; the connected sections
 * (History / Favorites / Details) supply their `show*` / `onToggle*` directly and
 * render their list/detail content as `children`.
 *
 * Ids/classes/aria are kept byte-identical to the original three hand-rolled
 * panels: the toggle is `${id}-toggle`; the panel id defaults to `${id}-panel`
 * with class `disclosure-panel` (History/Favorites), and both are overridable so
 * Details keeps its `details` id + `details` panel class + disabled toggle.
 * `aria-controls` always points at the panel id.
 */
import { memo, type ReactNode } from "react";

export interface DisclosureProps {
  /** The toggle button's visible label (also its accessible name). */
  label: string;
  /** Base id → `${id}-toggle` for the button; default panel id `${id}-panel`. */
  id: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  /** Disables the toggle (e.g. Details with no current scheme). */
  disabled?: boolean;
  /** Panel id + `aria-controls` target (default `${id}-panel`). */
  panelId?: string;
  /** Panel className (default `disclosure-panel`). */
  panelClassName?: string;
}

export const Disclosure = memo(function Disclosure({
  label,
  id,
  expanded,
  onToggle,
  children,
  disabled = false,
  panelId,
  panelClassName = "disclosure-panel",
}: DisclosureProps) {
  const panel = panelId ?? `${id}-panel`;
  return (
    <section className="popup__section">
      <button
        id={`${id}-toggle`}
        className="disclosure"
        type="button"
        aria-expanded={expanded}
        aria-controls={panel}
        disabled={disabled}
        onClick={onToggle}
      >
        {label}
      </button>
      <div id={panel} className={panelClassName} hidden={!expanded}>
        {children}
      </div>
    </section>
  );
});
