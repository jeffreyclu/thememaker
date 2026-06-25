/**
 * Favorites disclosure panel + list. Each row applies on click and has a delete
 * control; the just-saved row is highlighted via `--saved`. CONNECTED: reads its
 * own state + intents from context, so the container passes it nothing. The leaf
 * `FavoriteRow` stays pure (one favorite + callbacks).
 */
import { memo } from "react";

import { ApplyButton } from "./ApplyButton";
import { usePopupActions, usePopupState } from "../hooks/usePopupContext";
import { schemeSwatches } from "../state/scheme-view-model";
import type { Favorite } from "../../lib/storage/storage";

const FavoriteRow = memo(function FavoriteRow({
  favorite,
  saved,
  onApply,
  onDelete,
}: {
  favorite: Favorite;
  saved: boolean;
  onApply: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <li className={`favorites__item${saved ? " favorites__item--saved" : ""}`}>
      <ApplyButton
        buttonClass="favorites__apply"
        labelClass="favorites__label"
        labelText={favorite.name}
        stripClass="favorites__swatches"
        swatchClass="favorites__swatch"
        swatches={schemeSwatches(favorite.scheme)}
        onClick={() => onApply(favorite.id)}
        data={{ "data-favorite-id": favorite.id }}
      />
      <button
        type="button"
        className="favorites__delete"
        data-favorite-delete={favorite.id}
        aria-label={`Delete favorite ${favorite.name}`}
        title="Delete"
        onClick={() => onDelete(favorite.id)}
      >
        ×
      </button>
    </li>
  );
});

export const Favorites = memo(function Favorites() {
  const {
    favorites,
    showFavorites: expanded,
    savedFavoriteId,
  } = usePopupState();
  const {
    onToggleFavorites: onToggle,
    onSelectFavorite: onApply,
    onDeleteFavorite: onDelete,
  } = usePopupActions();
  return (
    <section className="popup__section">
      <button
        id="favorites-toggle"
        className="disclosure"
        type="button"
        aria-expanded={expanded}
        aria-controls="favorites-panel"
        onClick={onToggle}
      >
        Favorites
      </button>
      <div id="favorites-panel" className="disclosure-panel" hidden={!expanded}>
        <ul id="favorites" className="favorites" aria-label="Saved favorites">
          {favorites.length === 0 ? (
            <li className="favorites__empty">
              No favorites yet. Save a scheme.
            </li>
          ) : (
            favorites.map((fav) => (
              <FavoriteRow
                key={fav.id}
                favorite={fav}
                saved={fav.id === savedFavoriteId}
                onApply={onApply}
                onDelete={onDelete}
              />
            ))
          )}
        </ul>
      </div>
    </section>
  );
});
