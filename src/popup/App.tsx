/**
 * Popup composition root.
 *
 * `App` nests the two providers (`PopupProvider` → `SchemeProvider`) and lays out
 * the connected sections. Each section reads exactly the state + intents it needs
 * from context, so the root does NO prop drilling and reads NO state itself — it's
 * pure composition.
 */
import { PopupProvider } from "./PopupProvider";
import { SchemeProvider } from "./SchemeProvider";
import { Controls } from "./components/Controls";
import { Actions } from "./components/Actions";
import { Status } from "./components/Status";
import { Details } from "./components/Details";
import { Favorites } from "./components/Favorites";
import { History } from "./components/History";

const PopupView = () => (
  <main className="popup">
    <header className="popup__header">
      <h1 className="popup__title">Thememaker</h1>
    </header>
    <Controls />
    <Actions />
    <Status />
    <Details />
    <Favorites />
    <History />
  </main>
);

export const App = () => (
  <PopupProvider>
    <SchemeProvider>
      <PopupView />
    </SchemeProvider>
  </PopupProvider>
);
