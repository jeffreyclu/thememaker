/**
 * The top control cluster: mode / intensity / invert. A CONNECTED component that
 * reads state + actions from context and feeds the three pure form primitives
 * (`ModeSelect` / `IntensitySlider` / `InvertToggle`), which stay reusable on a
 * minimal value+onChange contract.
 */
import { memo } from "react";

import { usePopupActions, usePopupState } from "../hooks/usePopupContext";
import { ModeSelect } from "./ModeSelect";
import { IntensitySlider } from "./IntensitySlider";
import { InvertToggle } from "./InvertToggle";

export const Controls = memo(function Controls() {
  const { mode, intensity, invert } = usePopupState();
  const { onSelectMode, onSelectIntensity, onToggleInvert } = usePopupActions();
  return (
    <>
      <ModeSelect value={mode} onChange={onSelectMode} />
      <IntensitySlider value={intensity} onChange={onSelectIntensity} />
      <InvertToggle checked={invert} onToggle={onToggleInvert} />
    </>
  );
});
