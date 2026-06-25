/**
 * The action buttons (Generate / Save / Reset / Customize). A CONNECTED
 * component: it reads state + actions from context, so the container passes it
 * nothing. The repeated button markup is factored into one `<button>` map over a
 * small descriptor list — no copy-paste per button.
 */
import { memo } from "react";

import { useSchemeState } from "../state/SchemeProvider";
import { useGenerate } from "../hooks/useGenerate";
import { useApplyScheme } from "../hooks/useApplyScheme";
import { useFavorites } from "../hooks/useFavorites";
import { usePopupState } from "../state/PopupProvider";
import { isCurrentSaved } from "../../lib/scheme";

interface ButtonSpec {
  id: string;
  className: string;
  label: string;
  disabled: boolean;
  onClick: () => void;
}

const ActionButton = memo(function ActionButton({
  id,
  className,
  label,
  disabled,
  onClick,
}: ButtonSpec) {
  return (
    <button
      id={id}
      className={className}
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
});

export const Actions = memo(function Actions() {
  const state = useSchemeState();
  const { loading } = usePopupState();
  const { onGenerate } = useGenerate();
  const { onReset, onPickElement } = useApplyScheme();
  const { onSaveFavorite } = useFavorites();

  // Save: no scheme, or the current scheme (at this intensity + overrides) is
  // already a favorite (no dupes; re-enables once something changes).
  const saveDisabled = !state.current || isCurrentSaved(state);

  // The primary row + the Customize row share one button descriptor shape.
  const primary: ButtonSpec[] = [
    {
      id: "generate",
      className: "btn btn--primary",
      label: loading ? "Generating…" : "Generate",
      disabled: loading,
      onClick: onGenerate,
    },
    {
      id: "favorite-save",
      className: "btn",
      label: "Save",
      disabled: saveDisabled,
      onClick: onSaveFavorite,
    },
    {
      id: "reset",
      className: "btn",
      label: "Reset",
      // Reset is available whenever there's something on the page or in the popup.
      disabled: !state.applied && !state.current,
      onClick: onReset,
    },
  ];

  return (
    <>
      <div className="popup__actions">
        {primary.map((spec) => (
          <ActionButton key={spec.id} {...spec} />
        ))}
      </div>
      <div className="popup__actions">
        <ActionButton
          id="customize"
          className="btn"
          label="Customize…"
          // Customize layers overrides on the live theme (current OR applied).
          disabled={!(Boolean(state.current) || state.applied)}
          onClick={onPickElement}
        />
      </div>
    </>
  );
});
