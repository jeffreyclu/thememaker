/**
 * Status line. Errors-only; the `--error` class is applied only when there is a
 * message. Connected: reads `error` from context.
 */
import { memo } from "react";

import { usePopupState } from "../state/PopupProvider";

export const Status = memo(function Status() {
  const { error } = usePopupState();
  return (
    <p
      id="status"
      className={`popup__status${error ? " popup__status--error" : ""}`}
      role="status"
      aria-live="polite"
    >
      {error ?? ""}
    </p>
  );
});
