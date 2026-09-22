# PrepIQ Redesign — Phase Plan

Lives at repo root. Read this and `DEVIATIONS.md` at the start of every session,
alongside the relevant section of the handoff README.

**Handoff bundle:** `/d/remote-it-academy/design_handoff_prepiq_redesign/`
(outside the repo, deliberately — it must not reach `git status` or the Vercel
upload).

**Branch:** `feat/redesign-tokens` — **merged to `main`. The redesign is done;
all five blocks are closed.**

---

## NEXT WORK — open, unstarted

Two items came out of the redesign that are deliberately NOT part of it. Both
were found by measurement, both are recorded in `DEVIATIONS.md`, and neither has
been started.

### 1. The mixed-number catalog defect

`"1 and 1/2 Green Chilli, deseeded"` produces a catalog item named **`and`** in
section `Other`, and **Chilli Lime Chicken loses its green chilli** from the
shopping list. The cause is the mixed-number form `1 and 1/2`, not the
parenthesis rules — those were measured clean across all 2,048 paren-bearing
lines (DEVIATIONS, "Block D pre-check").

Scope: one recipe, one ingredient, out of 3,990 card-item pairs.

**Why it gets its own pass:** the fix is a pipeline change plus a catalog
rebuild, and a rebuild **renumbers item ids**, which invalidates every stored
exclusion. So it needs its own `EXCLUDED_VERSION` bump and its own reset,
exactly like block B's — not a patch tucked into other work.

Cleared at the same time and needing nothing: `ice` (from `Handful Ice Cubes` —
ice is what you buy) and `egg`. Also noted: `byCard` holds 2 keys (385, 386)
with no recipe in `recipes.js`, leaving one item (`low carb tortilla wrap`)
unreachable. Harmless, and for the same pass.

### 2. Preview needs its own Firebase project

**Preview and production share `prepiq-4ddb5` today.** That is why the whole
pre-merge review ran local-only: there are no Preview-scoped env vars, and
pointing preview at production would let an unmerged branch run block B's
`CHECKS_VERSION 3` / `EXCLUDED_VERSION 3` resets against real user data.

Any future preview that needs a working cloud has to have **`prepiq-preview`**
standing behind Preview-scoped `VITE_FIREBASE_*` variables first. Until then,
previews are local-only by construction — which works, and says so in Settings
(DEVIATIONS §13).

Related and already fixed, not open: `.env` was being uploaded to Vercel on
every deploy (DEVIATIONS §14).

---

## Session protocol

Every session:

1. Read `PHASES.md` and `DEVIATIONS.md`.
2. Read the handoff README section for the block in hand. **Every value in it is
   authoritative** — no rounding, no nearby-token substitution.
3. Report a change plan before editing.
4. Commit per screen or per unit of work, never one commit per block.
5. Update `PHASES.md` status and `DEVIATIONS.md` as part of the commit, not after.

**Prototypes are reference only.** Never port `support.js`, `<x-dc>`, or `{{ }}`
syntax. Read markup for structure and inline styles for exact values, then write
ordinary JSX. Serve over HTTP to view: `npx serve .` in `design/`.

**Never invent, paraphrase, or substitute recipe content.** Render what
`recipe-details.json` holds.

**No new dependencies without asking.**

---

## Blocks

Nine phases collapsed into five blocks. Three boundaries are load-bearing and
must not move: **B alone** (state surgery), **D alone** (highest-risk screen),
**E last** (needs every screen done).

| Block | Contents | Status |
| --- | --- | --- |
| — | Phase 1 — tokens | **Done** — `504c3ea` |
| A | Phase 2 — shell, nav, logo, primitives | **Done** |
| B | Phase 3 — connected model + migrations | **Done** |
| C | Sheets, then Today / Plan / Recipes / Track | **Done** |
| D | Grocery | **Done** |
| E | iPad + desktop | **Done** |

**Ordering note:** the original phase list built the four list screens before
the recipe sheet. That is backwards — RecipeSheet is reached from Today, Plan,
Recipes, and Track, so building screens first means stubbing four tap targets
and returning. Block C builds the sheets first.

---

## Block A — shell, nav, logo, primitives *(done)*

**Files:** `App.jsx`, `BottomNav.jsx`, new `Card.jsx`, new `Logo.jsx`, new sheet
primitive.

- Shell gradient on a **fixed layer behind a transparent scroller** — an
  explicit `position:absolute; inset:0` element, sized in `dvh`, page ground
  `#08090A` so overscroll reveals the ramp's ground. NOT
  `background-attachment: fixed` on body, which is unreliable in iOS Safari and
  this app lives on iPhone.

  An earlier line here said "scroll container, full scroll height", inherited
  from the handoff prose without checking the markup. That was wrong — see
  DEVIATIONS.md, "The shell ramp". Block E swaps one token
  (`--pq-shell-wide`, 168deg); the mechanism is unchanged.
- Scroll containers reserve `padding-bottom: 92px`.
- Bottom nav: 64px, 20px Lucide-style stroked icons, 9px/600/.10em mono labels,
  4px gap, accent active state at stroke-width 2.4 vs 1.8 inactive (`#8A938F`).

**Constraints:**

- `Card.jsx` is translucent white over the shell, so its lightness is a function
  of scroll position. It can never take an opaque fallback background and can
  never nest inside anything opaque. Guard this with a test.
- **Sheets get their own primitive, not a `Card` variant.** Settings and
  RecipeSheet use an opaque gradient, a different shadow, and top-only 20px
  radius. A `variant="sheet"` prop makes one component do two unrelated jobs.
- `Logo.jsx` parameterized from the start — 30px phone / 34px sidebar, 8px / 9px
  radius, 11px / 12px mono — so block E does not fork it.
- **Do not wire the grocery nav dot.** It depends on per-day `checks` and
  `groceryDay`, neither of which exists until block B. Stub with
  `TODO(phase-3)`. Carried forward below.

**Verify: CLOSED, not carried.** Under a fixed ramp the full gradient renders
on every screen at any list length, so the "does it read flat at 260 rows"
question cannot arise — that failure was specific to a document-height ramp,
which is what the check found and removed.

### Open item from block A — RESOLVED

`shade()` is deleted. Reading the implementation in the prototypes rather than
inferring from outputs answered both halves:

- The helper is plain sRGB interpolation, no gamma linearisation.
- A custom accent is not a feature. The prototype exposes `accent` as an
  **editor prop with four options** — a design-tool affordance for trying
  alternatives on the canvas, not a product feature. The handoff describes no
  picker and Settings holds only macro goals and preference toggles. That is
  why a derivable ramp existed at all, and why the helper is now gone.

**The ramp is decided: ship the published hex.** Only one stop was ever in real
dispute — `lift`, where `#DDF667` implies k≈0.30 against the 0.22 that the
prose *and* the prototype source both state, so the README contradicts its own
method. `drop` and `edge` differ by ±1 (ceil/floor against round) and `shade`
is identical. Do not re-derive this; the table is in `DEVIATIONS.md`.

---

## Block B — connected model + migrations *(runs alone)*

**Files:** `storeLogic.js`, `useAppStore.jsx`, `groceryList.test.js`,
`groceryNoReflow.test.jsx`.

`weekPlan` becomes the single source of truth. Today is a derived view. Grocery
is derived, never stored — **there is no "add to list" affordance anywhere**.
Track pre-fills from Today's plan. Changing a day's meal changes the grocery
list on the next render.

### Derivation change

`buildGroceryItems(weekPlan, catalog, excluded, dayIndex)` — iterate one day
only. **`dayIndex` is always a real integer.** Resolve `null -> todayIndex` at
the call site in the store; keeping date resolution out of the pure function
preserves testability and avoids the surface where the UTC date bug lived.
Build the exclusion key string in the caller where possible.

Keep the `seenCards` dedupe — a recipe twice in one day is one shop.

### Test order — do not invert this

**Write the day-scoped assertions from the README first, and let them fail.**
Then change the implementation. Rewriting the ~8 week-wide tests after the fact
means they encode whatever the new code happens to do rather than what the spec
requires.

Keep an explicit dedupe-within-a-day test. `groceryNoReflow.test.jsx` must
become deterministic: fixed day, fixed recipe set, **exact** row count. It is
the only automated protection for the paint-only row contract.

### Migrations — both in one commit

- `CHECKS_VERSION` -> 3, reset. Per-day, keyed `dayIndex:itemId`.
- `EXCLUDED_VERSION` -> **3**, reset. **Corrected from the `-> 2` this
  document originally said.** Exclusions never had a version constant of their
  own — they reused `CHECKS_VERSION`, and a live document on this branch
  measured `{"version":2,"ids":[13,18]}`. At 2 the constant would have read
  every existing bare-id exclusion back as valid, where it matches nothing and
  clears nothing: a migration that loses, wearing a reset's clothes. Separate
  constants so the two can diverge later; both past 2 so both actually reset.

Reset rather than migrate: an exclusion means "I already have this, for this
shop" — transient, not a record. Inventing a day index for a week-wide
exclusion would be inventing data. Same pattern as the `recipe_${id}` re-key.

### Persistence — local-first

Hydrate from localStorage synchronously at store construction; let the Firestore
read land later and reconcile. The `user === undefined` gate becomes auth-only.

**Whose scope, before auth resolves?** The last signed-in uid is remembered
unscoped (`prepiq_last_uid`) and the boot reads that scope. Reading `anon` for a
signed-in user would be the shared-device bleed this same migration fixes,
arriving from the other end. Auth then confirms or contradicts it; contradiction
costs one re-read. `bootScope` is exposed so the app renders instead of spinning
when the device already knows whose data it holds.

**Confirmed in phase 0: `saveLS` keys are NOT uid-namespaced.** Only the meal
log interpolates anything, and that is a date. `prepiq_goals`,
`prepiq_weekplan`, `prepiq_grocery`, `prepiq_grocery_excluded` and
`prepiq_favorites` are global. Today that is masked because hydration waits for
Firestore, which overwrites. Making hydration synchronous **exposes it**: user B
sees user A's plan on a shared device until the cloud read lands. Namespace them
in this same migration.

### Carried forward into block B

- [x] Wire the grocery nav badge to per-day checks + `groceryDay`
      (`TODO(phase-3)` stub from block A). Done — `groceryUnchecked` in the
      store, fed by the same derivation the screen renders, so the dot and the
      list cannot disagree. A test asserts no `TODO(phase-3)` and no
      `&& false &&` remain in `BottomNav.jsx`, because a checked box in a
      document is not what stops a stub from surviving a merge.
- [x] Namespace `saveLS` keys by uid, alongside the two version resets. Done —
      `lsKey(uid, name)`, anon scope `prepiq_anon_*`, per-key adoption on first
      sign-in.

---

## Block B — the chain walk, half-deferred

Measured at the end of block B, with a throwaway probe:

```
BEFORE  Plan Tue = [3,4]    grocery 31 rows, badge 31
AFTER   Plan Tue = [21,284] grocery 20 rows, badge 20
```

**Plan -> grocery -> badge is connected**, no manual sync anywhere.

**Plan -> Today and Plan -> Track are not — because those screens do not read
`weekPlan` at all yet.** Neither file mentions it, and Track has no `PLANNED`
list. That is block C's job (C3 Today, C6 Track), not a block B regression.
Moved into block C's gate below so it is not silently skipped: a link that
cannot be walked yet must be walked when it can.

---

## Block C — sheets, then read screens

**Carried in from block B: DONE.** Today and Track read `weekPlan`. The full
walk, measured under one store with all four surfaces mounted at once:

```
plan today = [1, 2]   Spicy Chicken Wraps + Honey BBQ Chicken Mac & Cheese
BEFORE          Today  2 | Plan  2 | Track  2 | Grocery  19 rows (derived 25)
-> remove Spicy Chicken Wraps
AFTER REMOVE    Today  1 | Plan  1 | Track  1 | Grocery  11 rows (derived 14)
-> assign Creamy Chicken Mac and Cheese
AFTER ASSIGN    Today  2 | Plan  2 | Track  2 | Grocery  17 rows (derived 22)
-> log one from Track
AFTER LOG       Today  2 | Plan  2 | Track  1 | Grocery  17 rows (derived 22)
```

Logging moves Today and Track and leaves Plan and Grocery alone — eating
something does not un-plan it or un-buy its ingredients. Kept as
`connectedChain.test.jsx` rather than a one-off probe.



Commit per screen. Natural split point if it runs long: **after the sheets and
Today**. The remaining three screens are the same shape repeated.

- [x] **C1 RecipeSheet** — done. Ingredients render as whole lines per the
      markup; the prototype's heading classifier is replaced (it demoted 407
      real ingredients). No generated description, no defaulted servings, no
      derived prep time.
- [x] **C2 Settings** — done. Four goal fields held locally until SAVE, one
      preference toggle (theme is the only preference that exists). The
      prototype PRESETS row is NOT built — its values are placeholders, and
      choosing them would be issuing nutrition guidance.
- [x] **C3 Today** — done, and the block B chain link with it: Today now reads
      weekPlan. Macro card is two cells per the markup ruling, not the four the
      prose describes.
- [x] **C4 Plan** — done. Day cards are flat panels, not Cards: seven
      translucent surfaces down one screen would each read a different
      lightness through the fixed ramp.
- [x] **C5 Recipes** — done. Paginated at 40. Trailing control is the heart per
      the markup, not the assign button the prose describes; assigning happens
      in the sheet. Ramp confirmed at all 260 rows.
- [x] **C6 Track** — done, and the second block B chain link with it. Macro
      card is the markup's own treatment, not "the same four-cell grid as
      Today" the prose describes.

Exact values per screen: handoff README, "Screens".

---

## Block D — Grocery *(runs alone)*

**These mechanics were deliberate in the current app and are unchanged by the
redesign. If a simpler approach would collapse the two buttons into one, animate
the row, or sort checked items to the bottom — stop and ask.**

Full invariant list: handoff README, "Grocery — the interaction model to
preserve". The load-bearing ones:

- Row is **two buttons side by side**. Left `flex: 1`, 56px, holds checkbox +
  name + quantity. Right fixed 44 x 56px expander.
- **Feedback is paint-only.** Checkbox fills with the accent gradient and shows
  a 14px check stroked `#0E1012` at width 3; name gets `line-through`; row
  opacity -> `0.45` over `.15s`. **Nothing below the tapped row may shift.**
- Name **18px minimum**, weight 500, `#F2F5EE`, single line ellipsis. Do not
  reduce.
- Quantities mono, right-aligned. Multiple quantities listed, never
  force-converted.
- Collapse state persists across day changes. `Spices & seasoning` collapsed by
  default, catalog-driven.
- `Clear` acts only on checked rows -> day-keyed exclusion set -> Undo 3500ms.
- Empty day shows the dashed block, not a header with empty sections.

**Verify:** run the deterministic reflow harness. A row's `top` must be
identical before and after a check, and no row below may move.

### Built — and the harness got stricter

The checkbox is a 22px box that always contains its check mark, at
`opacity: 0` when unchecked, and declares the same 1.5px border in both states.
So a tap adds no node and changes no width: the SVG-internals exemption the old
harness needed is **gone**, and every node in the list is snapshotted now.

Two gaps in the harness itself, both found by running it: the `background`
shorthand expands to a different set of longhands for a flat rgba() than for a
gradient (all paint, now named), and the `border` shorthand carries its colour
(compared on width and style only, colour left to `border-color` — putting
`border` in PAINT_ONLY would have stopped it seeing a width change).

Mutation-checked against every change the block forbids: sinking checked rows
(4 fail), removing them (4), animating the row height (4), dropping the
checkbox border (5), rendering the check conditionally (5).

**Quantities are in the expander, not on the row.** Confirmed with the user
before building — see DEVIATIONS.md §8.

### Carried in from block B — both done

- [x] `SyncErrorBanner` out of the Shell overlay, into its agreed slot under the
      grocery header and above the day chips.
- [x] Grocery migrated off the pre-redesign tokens. `Auth.jsx` is the only file
      left on them, and it is outside the redesign's six screens.

---

## Block E — iPad + desktop *(last)*

The shell mechanism carries over unchanged: same fixed layer, swapping
`--pq-shell` for `--pq-shell-wide` (168deg). Nothing else about it changes.

84px collapsed rail / 224px expanded, user-toggleable on **both** wide surfaces,
so rail width is a user choice rather than a function of screen size. Two panes
on iPad, three columns on desktop where the data supports it. Nothing about the
visual language changes between surfaces — only layout and affordance sizes.

**Also in block E:** remove Plus Jakarta once the last component migrates. Check
the font payload against the baseline in `DEVIATIONS.md`.

### Built

- **`Rail.jsx`, one component for both wide surfaces.** 84/224 is a table of
  values, not a second component — which is why `Logo.jsx` was parameterised in
  block A. Six destinations: the five phone tabs plus Goals at the foot.
- **Width is a stored choice.** `railStored` is `null` until the user touches
  the control; only then does the surface stop having an opinion. Local only —
  a sidebar width is not account data.
- **`Settings` is one mounted component in two forms.** `open` gates what it
  renders, not whether it exists, so a half-typed goal survives the window
  being narrowed from pane to sheet. Owned by `App`.
- **The gutter is the only token that changes with the surface**, and it changes
  in `tokens.css` — every screen already pads with `var(--pq-gutter)`, so none
  can be left at the phone value by accident. Breakpoints 900 / 1400, matching
  `useSurface.js`; a test asserts the two files agree.
- **Grocery uses two explicit columns, not CSS `columns`** — see DEVIATIONS §10.
  The reflow harness runs at desktop width and asserts a tap in one column
  cannot move the other.
- **Auth migrated**, and Plus Jakarta + DM Mono removed: **14 woff2 -> 7, 144K.**

---

## Block F — Grocery by day *(in progress)*

Spec: `docs/design/grocery-by-day/GROCERY_BY_DAY_SPEC.md`, the readable
extraction of four Claude Design frames. The `.html` beside it needs that
runtime to render — open it to confirm a detail, not to view a page.

The grocery screen gains a day selector and shows the selected day's planned
meals as **recipe groups** (photo, eyebrow, title, that recipe's rows). The
consolidated store-walk list stays reachable as **WEEK** mode. Four phases.

### Phase 1 — the data layer *(done)*

`src/lib/groceryByDay.js`. `groupsForDay(weekPlan, catalog, excluded, dayIndex)`
returns one group per planned recipe, each carrying only its own ingredients,
in `day.ids` position order with items walked in catalog section order.

- **No new sort.** Item order comes from `groupBySection`, the same function the
  consolidated list walks, so the two cannot drift into different shop orders.
- **No new derivation of what is on the list.** A parity block asserts the union
  of every group's items is the same id set `buildGroceryItems` returns for that
  day — on every day of the harness fixture, and again with an exclusion
  applied. The failure it guards is an ingredient present in one view and absent
  from the other, which neither screen can show on its own.
- **One group for a recipe planned twice**, carrying `timesPlanned` so the
  eyebrow can say `x2` rather than the repeat being silently dropped. Same call
  `buildGroceryItems` makes with `seenCards`.
- **Exclusions stay day-wide**, keyed `dayIndex:itemId` as they already are, so
  clearing an item removes it from every group it appears in that day.
- `groupItemKey` defines a third key space, `dayIndex:instanceId:itemId` — one
  ingredient can be in two groups on one day and the two checks are independent.
  Nothing persists it yet; that is phase 3.

39 assertions, mutation-checked: ignoring exclusions fails 3, splitting a
repeated recipe into two groups fails 2.

---

## Standing verification

Before calling any block done:

- Re-read the relevant README section line by line and diff against what was
  built. Report any deviated value and why.
- Run the reflow harness.
- Touch targets: grocery rows 56px, buttons 44px minimum, nav items 64px.
  Nothing below 44px on a touch surface.
- Walk the derived chain by hand: change a meal on Plan -> Today updates ->
  grocery updates -> Track's planned list updates. No manual sync anywhere.
- Confirm the full ramp is visible on every screen at any scroll depth.
- Missing-photo fallback tiles at 36 / 48 / 56px, radius 7 / 9 / 10px.

  **The "calm column" half of this line is DROPPED.** It tested a condition
  that does not exist here: block C measured all 260 recipes as carrying a
  resolvable image, so there is no mostly-photoless list to read as anything.
  The tile coverage stays — `image` is set whether or not a file resolves, so
  the error path is real even though it is rare.
- Build clean, no console errors, **works offline with the network disabled**.

---

## Motion

Deliberately minimal — this is an instrument, not a showcase.

| Interaction | Behavior |
| --- | --- |
| Grocery row tap | opacity `.15s`, no layout change |
| Chevron rotate | `transform .15s` |
| Section collapse | immediate, no height animation |
| Sheet open | slide up from bottom, backdrop tap closes |
| Nav tab change | immediate |
| Undo | visible 3500ms, self-clears |
| Hover (desktop only) | bg to `rgba(0,0,0,0.3)`, border to `rgba(255,255,255,0.16)` |

---

## Decisions log

- **A — grocery scope:** day-scoped derivation, exclusions re-keyed
  `dayIndex:itemId`, reset rather than migrate. Signature takes a real integer.
- **B — checks:** per-day, keyed like `excluded`. Quantities differ per day, so
  a global check claims "bought" against a row that still needs a different
  amount.
- **C — persistence:** local-first hydration. `SyncErrorBanner` kept against the
  design, own slot.
- **Fonts:** self-hosted `@fontsource`, specific weights only (sans
  400/500/600/700, mono 400/500/600), not package root.
- **Accent ramp:** hardcoded, `shade()` deleted — no call site ever passed a
  custom accent. **Which seven literals — open, see `DEVIATIONS.md`.**
