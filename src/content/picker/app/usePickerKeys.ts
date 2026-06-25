/**
 * `usePickerKeys` — Esc-to-close for the panel. Installs a capture-phase keydown
 * listener (so the page can't act first) that swallows Escape and delegates to
 * the host's `onClose` (which hides the picker + ends pick mode). The React home
 * of the vanilla `onPickerKey`.
 */
import { useEffect } from "react";

import { usePickerState } from "./PickerProvider";

export const usePickerKeys = (): void => {
  const { onClose } = usePickerState();

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);
};
