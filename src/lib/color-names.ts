/**
 * Offline, deterministic color naming.
 *
 * The legacy extension showed thecolorapi.com's whimsical seed names (e.g.
 * "Brandy Rose"), but the default path now generates palettes LOCALLY with no
 * network, so there is no name to show — schemes fell back to "scheme". This
 * derives a readable, descriptive name from the color itself (hue family +
 * lightness/saturation modifier), so every generated scheme is labeled without
 * a request or a big name table.
 */
import { hexToHsl, normalizeHex } from "./color";

/** Maps a hue angle (0–360) to a base color-family name. */
const hueFamily = (h: number): string => {
  if (h < 15) return "Red";
  if (h < 45) return "Orange";
  if (h < 65) return "Yellow";
  if (h < 90) return "Lime";
  if (h < 150) return "Green";
  if (h < 175) return "Teal";
  if (h < 195) return "Cyan";
  if (h < 250) return "Blue";
  if (h < 270) return "Indigo";
  if (h < 300) return "Purple";
  if (h < 330) return "Magenta";
  if (h < 345) return "Pink";
  return "Red";
};

/**
 * @returns a short, readable name for a hex color, e.g. "Vivid Blue",
 * "Dark Teal", "Pale Pink", "Gray", "Black". Deterministic and offline.
 */
export const describeColor = (hex: string): string => {
  const { h, s, l } = hexToHsl(normalizeHex(hex));

  // Achromatic extremes + grays (hue is meaningless at very low saturation).
  if (l <= 6) return "Black";
  if (l >= 95) return "White";
  if (s <= 8) {
    if (l < 30) return "Charcoal";
    if (l > 72) return "Silver";
    return "Gray";
  }

  const base = hueFamily(h);

  // At most one modifier so names stay one or two words. Lightness wins over
  // saturation (it reads more strongly), with vivid/muted as the fallback.
  let modifier = "";
  if (l < 22) modifier = "Dark";
  else if (l > 82) modifier = "Pale";
  else if (l > 66) modifier = "Light";
  else if (s < 25) modifier = "Muted";
  else if (s > 85) modifier = "Vivid";

  return modifier ? `${modifier} ${base}` : base;
};
