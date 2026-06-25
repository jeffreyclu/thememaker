/**
 * Popup React entry point.
 *
 * Mounts the popup into `#root`. All `chrome.*` access lives behind the
 * provider's effects/actions; this file only wires React to the DOM and pulls
 * in the popup stylesheet.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./popup.css";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) {
  throw new Error("missing popup root element: #root");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
