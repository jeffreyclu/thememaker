/**
 * In-page FLOATING CONTROL (Shadow DOM panel) for the element picker.
 *
 * A small fixed-position panel mounted on an OPEN Shadow DOM host attached to
 * `document.documentElement`, so:
 *  - the host page's CSS cannot reach into it (Shadow encapsulation), and
 *  - OUR engine never themes it — the host carries the {@link PANEL_HOST_ID} id
 *    and lives OUTSIDE `<body>`, and the walk/pick both skip it via that id.
 *
 * The panel is a THIN view: it renders rows from the pure model
 * (`picker-panel-model.ts`) and reports intents back through callbacks. The
 * content script (`index.ts`) owns the pick session, the live re-apply, and
 * persistence. Keep visuals simple and self-contained (inline `<style>` in the
 * shadow root, design-token-ish but isolated since the page can't see them).
 */
import { overrideRows, type OverrideRow } from "./picker-panel-model";
import type { RoleOverrides } from "../../types";

/** The id on the Shadow DOM host element — the engine + picker exclude this. */
export const PANEL_HOST_ID = "themeMakerPickerHost";

/** Intents the panel reports back to the content script. */
export interface PanelHandlers {
  /** A row's color input changed → apply + persist this override live. */
  onColorChange: (role: string, color: string) => void;
  /** A row's clear (×) was clicked → remove that override. */
  onClearRole: (role: string) => void;
  /** "Clear all" was clicked → drop every override. */
  onClearAll: () => void;
  /** "Done" / Esc → close the panel and exit pick mode. */
  onDone: () => void;
}

/** A mounted panel handle. `render` repaints rows; `destroy` tears it all down. */
export interface PanelHandle {
  /** The host element (so the content script can exclude it from the walk). */
  readonly host: HTMLElement;
  /** Re-render the rows from the current overrides. */
  render(overrides: RoleOverrides): void;
  /** Remove the panel + its host from the page. */
  destroy(): void;
}

const PANEL_STYLES = `
  :host { all: initial; }
  .panel {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 2147483647;
    width: 248px;
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    color: #1a1a1e;
    background: #ffffff;
    border: 1px solid #e2e2e6;
    border-radius: 10px;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22);
    box-sizing: border-box;
  }
  .header { display: flex; align-items: center; justify-content: space-between; }
  .title { font-weight: 600; }
  .hint { margin: 0; font-size: 12px; color: #6b6b73; }
  .rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; overflow-y: auto; }
  .empty { font-size: 12px; color: #6b6b73; }
  .row { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
  .row__label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row__color { flex: 0 0 auto; width: 28px; height: 24px; padding: 0; border: 1px solid #e2e2e6; border-radius: 4px; background: #fff; cursor: pointer; }
  .actions { display: flex; gap: 8px; }
  .btn { flex: 1; padding: 7px 10px; font: inherit; font-size: 13px; font-weight: 500; color: #1a1a1e; background: #f5f5f7; border: 1px solid #e2e2e6; border-radius: 8px; cursor: pointer; }
  .btn:hover { border-color: #4f46e5; }
  .btn--primary { color: #fff; background: #4f46e5; border-color: #4f46e5; }
  .iconbtn { flex: 0 0 auto; width: 22px; height: 22px; padding: 0; line-height: 1; font-size: 15px; color: #6b6b73; background: #f5f5f7; border: 1px solid #e2e2e6; border-radius: 6px; cursor: pointer; }
  .iconbtn:hover { color: #fff; background: #b42318; border-color: #b42318; }
`;

/**
 * Mounts the floating panel. Returns a handle to re-render rows + destroy it.
 * Idempotent at the call site (the content script tracks a single instance).
 */
export const mountPickerPanel = (handlers: PanelHandlers): PanelHandle => {
  const host = document.createElement("div");
  host.id = PANEL_HOST_ID;
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = PANEL_STYLES;

  // Build the shell with `createElement` (same style as `renderRow` below), so
  // every element is a typed reference — no `innerHTML` + re-query + non-null
  // cast, which would silently break if a class/attr were renamed.
  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
  ): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
  };

  const title = el("span", "title");
  title.textContent = "Pick a color";
  const header = el("div", "header");
  header.append(title);

  const hint = el("p", "hint");
  hint.textContent =
    "Click any element on the page to recolor every element of its tag.";

  const rowsEl = el("ul", "rows");
  rowsEl.setAttribute("aria-label", "Custom color overrides");

  const clearAllBtn = el("button", "btn");
  clearAllBtn.type = "button";
  clearAllBtn.textContent = "Clear all";

  const doneBtn = el("button", "btn btn--primary");
  doneBtn.type = "button";
  doneBtn.textContent = "Done";

  const actions = el("div", "actions");
  actions.append(clearAllBtn, doneBtn);

  const panel = el("div", "panel");
  panel.append(header, hint, rowsEl, actions);

  shadow.append(style, panel);
  // Mount on the documentElement, OUTSIDE <body>, so the engine's body-walk
  // never reaches the host and the page theme can't cascade in.
  document.documentElement.appendChild(host);

  const renderRow = (row: OverrideRow): HTMLLIElement => {
    const li = document.createElement("li");
    li.className = "row";

    const label = document.createElement("span");
    label.className = "row__label";
    label.textContent = row.label;

    const color = document.createElement("input");
    color.type = "color";
    color.className = "row__color";
    color.value = row.color;
    color.setAttribute("aria-label", `${row.label} color`);
    color.addEventListener("input", () =>
      handlers.onColorChange(row.role, color.value),
    );

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "iconbtn";
    clear.textContent = "×";
    clear.title = "Clear";
    clear.setAttribute("aria-label", `Clear ${row.label} override`);
    clear.addEventListener("click", () => handlers.onClearRole(row.role));

    li.append(label, color, clear);
    return li;
  };

  const render = (overrides: RoleOverrides): void => {
    rowsEl.replaceChildren();
    const rows = overrideRows(overrides);
    clearAllBtn.disabled = rows.length === 0;
    if (rows.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "No custom colors yet. Click an element.";
      rowsEl.appendChild(empty);
      return;
    }
    for (const row of rows) {
      rowsEl.appendChild(renderRow(row));
    }
  };

  clearAllBtn.addEventListener("click", () => handlers.onClearAll());
  doneBtn.addEventListener("click", () => handlers.onDone());

  return {
    host,
    render,
    destroy: () => host.remove(),
  };
};
