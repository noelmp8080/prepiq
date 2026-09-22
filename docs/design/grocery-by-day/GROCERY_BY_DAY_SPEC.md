# Grocery by Day — design spec

Extracted from `PrepIQ_Grocery_Mockups.html` (Claude Design, 22 Sep 2026).
Four frames: Desktop 1440×900, iPad landscape 1024×768, iPad portrait 820×1180,
iPhone 393×852. This file is the readable version of those frames; the HTML is
the visual reference.

## Concept

The grocery screen gets a day selector. Selecting a day shows that day's planned
meals as **recipe groups** — each with the recipe photo, a meal/count eyebrow,
the recipe title, and that recipe's ingredient rows. This is a per-day cooking
view, not a consolidated shopping list. The existing store-walk consolidated
list stays reachable as a "WEEK" mode (see Decisions).

## Tokens (as drawn)

Map these to the app's existing theme tokens where equivalents exist; do not
introduce a second palette.

| Role | Value |
|---|---|
| Screen background | linear-gradient(180deg, #2b343b, #1c2329) (frame); page bg #0f1418 |
| Primary text | #ffffff (titles), #e8ecef (item names) |
| Muted text | #8d99a3 |
| Accent | #c6f000 (lime) — selected day pill bg, meal eyebrow text |
| Accent on-color | #111 (text on lime pill) |
| Unselected pill | bg rgba(255,255,255,.05), border 1px rgba(255,255,255,.07), text #e8ecef |
| Checkbox border | 1.5px solid #6b7780, radius 4px (5px on phone) |
| Row divider | 1px solid rgba(255,255,255,.06) |
| Header divider | 1px solid rgba(255,255,255,.07) |
| Sans | 'Source Sans 3' |
| Mono | 'IBM Plex Mono' |

## Type

| Element | Style |
|---|---|
| "SHOPPING FOR" label | mono 500 10px, letter-spacing .14em, muted |
| Day pill | mono 500 11px, letter-spacing .1em; padding 9px 18px (desktop), 16px (iPad L), 14px (iPad P) |
| "14 LEFT · CLEAR" | mono 500 11px, letter-spacing .12em, muted |
| Meal eyebrow "DINNER · 9 ITEMS" | mono 500 10px, letter-spacing .14em, accent |
| Recipe title | sans 700 26px/1.1 white (22px/1.15 on phone) |
| Item name | sans 600 16px, #e8ecef |
| Item quantity | mono 400 11px, muted, right-aligned |
| Phone day heading "Monday" | sans 700 26px/1 white |

## Layout per breakpoint

### Desktop 1440
- Header row: "SHOPPING FOR" + seven pills MON…SUN + spacer + "14 LEFT · CLEAR".
  Padding 18px 32px, bottom border.
- Body: padding 32px 40px, groups stacked with 36px gap.
- Each group: grid `340px minmax(0,1fr)`, gap 48px, align-start.
  - Left: photo 210px tall, radius 10, then eyebrow, then title (8px gap).
  - Right: ingredient rows in a 3-column grid, column-gap 40px, row-gap 12px.
- Row: flex, gap 12px; checkbox 18px; name flex:1; quantity right; bottom
  border; padding-bottom 10px.

### iPad landscape 1024
- Same header, padding 18px 30px.
- Body padding 28px 30px, group gap 32px.
- Group grid `280px 1fr`, gap 30px. Photo 180px tall.
- Rows in a 2-column grid, column-gap 36px, row-gap 12px. Checkbox 20px.

### iPad portrait 820
- Same header, padding 18px 28px, pills padding 9px 14px.
  Header right shows "14 LEFT" only (no CLEAR) — treat as a width-driven
  truncation, not a feature difference.
- Otherwise as iPad landscape with the grid collapsing to a single column of
  rows if the photo column + 2 columns don't fit.

### iPhone 393
- No "SHOPPING FOR" label. Top row: day name as heading ("Monday") left,
  "14 LEFT" right, baseline-aligned. Padding 58px 22px 0 (safe area).
- Day pills: seven equal-width flex:1 pills, single letters M T W T F S S,
  padding 12px 0 (selected) / 11px 0, gap 6px.
- Group header: 88×88 photo thumb left, eyebrow + 22px title right, gap 14px.
- Rows: single column, padding 11px 0, checkbox 22px, bottom border.
- Groups stacked; second group has padding-top 10px.
- CLEAR is not visible in the frame — put it in the existing overflow /
  bottom-sheet pattern the app already uses, not a new control.

## Behaviour (not in the frames — decisions)

1. **Data source.** A day's groups come from the meal plan for that day, in
   meal order (breakfast → lunch → dinner → snacks, matching the app's own
   order). One group per planned recipe. Ingredients within a group are
   deduplicated within the recipe only.
2. **Row order within a group.** Store-walk section order, reusing the existing
   section map. The mockup's row order is illustrative, not a spec.
3. **Checked state.** Per (day, recipe instance, ingredient). Checking an item
   in Monday's wrap does not check it in Thursday's wrap. "N LEFT" is the
   unchecked count for the selected day. CLEAR clears the selected day only.
4. **WEEK mode.** An eighth pill "WEEK" after SUN (desktop/iPad) or as a small
   text control below the phone pill row shows the existing consolidated
   store-walk list unchanged. Remove this section if the day view is meant to
   fully replace the old screen.
5. **Photos.** Use the recipe's image if one exists. If the catalog has no
   images, render a flat tile in the same box (bg rgba(255,255,255,.05),
   recipe initials in mono, muted) and do not block the feature on photos.
6. **Rows stay paint-only on tap.** The existing DOM harness that asserts no
   layout property changes on tap applies to the new rows too. Row height may
   change from 56px to the mockup's ~46px, but it must still be fixed and
   the toggle must still be a paint-only change.
7. **Sticky.** Header row (day pills + count) is sticky. Keep the Safari-
   compatible sticky pattern already in the codebase.
8. **Default day.** Today, in the user's local timezone. If today has no
   planned meals, still show today with an empty state ("Nothing planned")
   rather than jumping to another day.
