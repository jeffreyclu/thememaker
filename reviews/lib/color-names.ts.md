# Review: `src/lib/color-names.ts`

**Purpose:** Offline, deterministic color naming. `describeColor(hex)` → a short human label ("Vivid Blue", "Dark Teal", "Gray") from hue family + lightness/saturation modifier, replacing thecolorapi.com's seed names for the local-first path.
**LOC:** 58.

## Overall grade: **A**

A tiny, pure, single-purpose function done right. Deterministic, offline, no DOM/chrome, well-tested, and it solves a real problem (no "scheme" placeholder) without a giant name table. Essentially nothing to fix.

## Findings

### [low] Hue-family and modifier thresholds are magic numbers (acceptable here, but unnamed)
`hueFamily` (14–28) and the modifier ladder (51–55) are walls of bare numeric boundaries (`h < 15`, `l < 22`, `s > 85`). Unlike `deriveRoles` in palette.ts, these are SHALLOW (one comparison each, clearly labeled by their return value) so they're readable as-is. Naming them would arguably hurt readability.

**Why it matters:** Marginal — flagging only for completeness. The thresholds ARE the spec of "what a color is called," and they read fine.

**Concrete fix:** None recommended. If anything, a single comment that the boundaries are perceptual/taste choices.

### [nit] `hueFamily` returns "Red" for both `h < 15` and `h >= 345` with two separate branches
Lines 15 and 27. The red wrap-around is handled by two returns rather than normalizing the hue. Minor; the explicit form is arguably clearer than `(h < 15 || h >= 345)`.

### [nit] No guard for invalid hex — relies on `normalizeHex` throwing
Line 35: `hexToHsl(normalizeHex(hex))`. If `hex` is invalid, `normalizeHex` throws and `describeColor` throws. Callers (state.ts `historyLabel`, engine-bridge) pass palette seeds which are always valid, so this is fine — but the throwing contract isn't documented. Trivial.

## What's GOOD
- **Pure, deterministic, offline, total for valid input** — exactly what the docstring promises, and tested.
- **Achromatic handling is correct**: black/white extremes and low-saturation grays are caught BEFORE applying a hue family (hue is meaningless at low saturation) — the right order, and the comment says why.
- **"At most one modifier, lightness wins over saturation"** is a sensible, documented rule that keeps names to one or two words.
- **Solves the real problem cheaply**: no network, no big lookup table, no dependency — just HSL bands. Right-sized for the need.

## Top 3 concrete changes
1. Nothing substantive. Optionally collapse the two "Red" branches in `hueFamily`.
2. Optionally document that `describeColor` throws on invalid hex (or guard with `isHexColor` and return "Unknown").
3. Leave it alone — this is a model small utility.
