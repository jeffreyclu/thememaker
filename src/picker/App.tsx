/**
 * Picker composition root.
 *
 * Wraps the state provider (`PickerProvider`) around the connected panel view,
 * mirroring the popup's `App`. The live theme + close intent arrive as props
 * (the shim feeds them via `main`'s render/update), so the root does no prop
 * drilling beyond seeding the provider and reads no state itself. Each section
 * inside the panel reads what it needs from context.
 */
import { PickerProvider } from "./state/PickerProvider";
import { Panel } from "./components/Panel";
import type { PickerAppProps } from "./main";

export const App = ({
  palette,
  intensity,
  overrides,
  onClose,
}: PickerAppProps) => (
  <PickerProvider
    palette={palette}
    intensity={intensity}
    overrides={overrides}
    onClose={onClose}
  >
    <Panel />
  </PickerProvider>
);
