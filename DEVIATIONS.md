# Deviations from the redesign handoff

Every departure from `design_handoff_prepiq_redesign/README.md`, with the
reason. Read alongside `PHASES.md` at the start of every session.

The handoff says every value in it is authoritative. Each entry below is a
place where following it literally would have made the app worse, or where
the handoff describes something that is not true of this codebase.

---

## 1. Type is self-hosted, not loaded from Google Fonts

**Handoff:** a `<link>` to `fonts.googleapis.com` for IBM Plex Sans and Mono.

**Built:** `@fontsource/ibm-plex-sans` and `-mono`, latin subset, specific
weight imports only — Sans 400/500/600/700, Mono 400/500/600. No package-root
imports, so no unused weights ship.

**Why:** this app removed exactly that dependency two commits before the
redesign began. The grocery list is used standing in a supermarket, which is
where the request fails; the app would fall back to a generic sans after every
row width had been measured against Plex. The handoff did not know that
decision had been made.

**Approved:** yes.

---

## 2. The accent ramp is seven literals, not generated

**Handoff:** the gradient stops are derived from the base accent with a
`shade()` helper, "+22% white" / "-26% black".

**Built:** the seven accent values are literals in `src/tokens.css`.
`shade()` does not exist in the app.

**Why:** two findings, in order.

First, a custom accent is not a feature. Nothing in the prototypes ever passes
a non-default accent — `this.props.accent ?? '#D0F224'` is a scaffolding
default no call site overrides. The handoff never mentions an accent picker,
and Settings holds only macro goal fields and preference toggles. A helper
kept for a feature nobody asked for is a helper that will eventually be used
to approximate a value already known exactly.

Second: the published values and the published method disagree on one stop.
See "The accent ramp" below — decided, and not to be re-derived.

**Approved:** yes.

---

## 3. `SyncErrorBanner` is kept, and the design has no slot for it

**Handoff:** "There is no loading state, no skeleton, and no error state in the
design because there is no fetch in the path."

**Built:** the banner survives, in its own slot under the header and above the
grocery day chips.

**Why:** the premise is false for this app as it stands — `App.jsx` blocks on
`user === undefined` and the store fires six `getDoc` calls on auth. Block B
makes hydration local-first, which removes the loading state honestly. But the
banner is not a loading state: it fires only on a failed *write*, never on
load, so it never appears in the offline store case. It is the only thing that
tells you a change did not reach your account, and it was added deliberately
after failed writes were found to be silent.

Not the undo position: undo holds that slot for 3500ms, and a failed write is
exactly what happens right after a clear.

**Approved:** yes.

---

## 4. Grocery is day-scoped; checks and exclusions reset

**Handoff:** grocery derives from one chosen day, exclusions keyed
`dayIndex:itemId`. Flags `checks` global-vs-per-day as an open question.

**Built (block B):** day-scoped derivation, `checks` per-day keyed the same
way, both stores version-bumped and reset rather than migrated.

**Why:** quantities differ per day, so a global check claims "bought" against a
row that still needs a different amount. Reset rather than migrate because an
exclusion means "I already have this, for this shop" — transient, not a record
— and inventing a day index for a week-wide exclusion would be inventing data.

**Approved:** yes.

---

## The accent ramp — decided, do not re-derive

**Decision: ship the published hex.** `#D0F224` / `#DDF667` / `#99B31B` /
`#F2FCBE` / `#798C15` / `#131719` / `#0E1012`, as literals in `src/tokens.css`.

### Why there was a question at all

The prototype holds **no literal hex for the ramp**. It computes all three
accent gradients at runtime from a single base:

```js
const shade = (hex, k) => { ...  k > 0 ? v + (255 - v) * k : v * (1 + k) ... }
accentGrad  = linear-gradient(150deg, shade(accent, 0.22), accent, shade(accent, -0.26))
accentBar   = linear-gradient(90deg,  shade(accent, -0.22), accent, shade(accent, 0.18))
accentRaise = inset ... shade(accent, 0.7) ... shade(accent, -0.42) ...
```

Plain sRGB interpolation — no gamma linearisation. Running it on the
prototype's own accent against the values the README and its `tokens.css`
publish:

| Stop | k | Prototype renders | Published | Delta |
| --- | --- | --- | --- | --- |
| lift | +0.22 | `#DAF554` | `#DDF667` | **R+3 G+1 B+19 — real** |
| drop | -0.26 | `#9AB31B` | `#99B31B` | R-1 — rounding |
| edge | +0.70 | `#F1FBBD` | `#F2FCBE` | +1 each — rounding |
| shade | -0.42 | `#798C15` | `#798C15` | identical |

Three of four are rounding artifacts (ceil/floor against round). **Only `lift`
is a genuine disagreement**, and it is not a transcription slip: `#DDF667`
corresponds to k of roughly 0.30, not the 0.22 that the README prose *and* the
prototype source both state. **The README contradicts its own documented
method.**

### Why the published value wins

It is the deliberate artifact. `tokens.css` shipped in the handoff as
paste-ready, the protocol says every value in the handoff is authoritative, and
the reversal is one line if that turns out wrong. A rendering that disagrees
with the document it shipped beside is the weaker signal.

### Why a derivable ramp existed in the first place

The prototype exposes `accent` as an **editor prop with four options** —
`this.props.accent ?? '#D0F224'`. That is a design-tool affordance for trying
alternatives on the canvas, not a product feature. Nothing in the app was ever
meant to pass a custom accent: the handoff describes no picker, and Settings
holds only macro goal fields and preference toggles.

So `shade()` is deleted. It existed to serve a canvas control that does not
cross into the app.

### Guard

The `"+22% white"` / `"-26% black"` comments are **removed** from
`src/tokens.css`. They are known false against the published values and are
precisely what would lure the next reader into regenerating the ramp. The token
lines point here instead.

---

## The shell ramp — fixed, not scroll-height

**Handoff prose:** "The gradient runs the full height of the scroll container,
so content at the top sits on a lighter graphite than content at the bottom."

**Built:** the gradient is painted once on a fixed `position:absolute; inset:0`
layer, with a transparent scroller over it.

### The evidence

The prototype's phone frame:

```html
<div style="width:390px;height:844px;
            background:linear-gradient(176deg,#3D464C 0%,#313A40 24%,
                                       #262D32 56%,#1D2327 100%);
            overflow:hidden">
  <div style="position:absolute;inset:0;overflow-y:auto">...</div>
</div>
```

`176deg` appears **exactly once** in that file, on the fixed frame. The
scroller inside carries **no background at all**. Content scrolls over a
static ramp; the ramp does not stretch to document height.

### Why the prose is wrong rather than just imprecise

For content under one viewport the two are indistinguishable, which is why the
sentence reads true on Today. At list length they diverge completely:

| | |
| --- | --- |
| 260 Recipes rows at ~64px | 16,640px of scroll |
| viewport | 844px |
| screens | 19.7 |
| **ramp visible per screen** | **5.1%** |

Stretched over the document, a four-stop ramp shows about a twentieth of itself
per screen — flat, and the dimensional effect the handoff credits it with is
gone. Fixed, every screen shows the whole ramp at any scroll depth.

**The handoff corroborates this against itself.** Its card section says a card
near the top of *a screen* is lighter than the same card near the bottom.
Screen, not document. That only holds under a fixed ramp.

### Accepted consequence

A card changes lightness as it scrolls through the ramp. That is the
prototype's behaviour and it is what the effect is made of. Not compensated
for.

### Implementation constraints

- An explicit absolute layer, **not** `background-attachment: fixed` on body —
  unreliable in iOS Safari, which is where this app lives.
- Sized in `dvh`, not `vh`, so the ramp tracks the visual viewport as Safari's
  toolbars collapse.
- Page ground `#08090A`, so an overscroll bounce reveals the ramp's own ground.
- Block E swaps `--pq-shell` for `--pq-shell-wide` (168deg). Same mechanism.

This **closed** the block-A carry-forward rather than deferring it: under a
fixed ramp the "does it read flat at 260 rows" question cannot arise.

---

## 5. Quantities are listed, never summed

**Handoff:** the README says a merged row carries "the total"; the prototype
markup and the shipped screen both render every contributing quantity as its
own mono line.

**Built:** listed, one line per contributing recipe.

**Why:** the summed reading is not merely less specific, it is
**under-defined**. `1 cup` + `200g` + `2 cloves` has no answer without unit
conversion, and the catalog carries free-text quantities lifted from the source
recipes. Listing is the only implementable reading of the two.

**Approved:** yes.

---

## 6. localStorage keys are scoped by user — a fix, not a deviation

**Handoff:** silent on persistence keys.

**Built (block B):** `prepiq_<scope>_<name>`, where scope is the uid or `anon`.

**Why this is not a deviation.** The keys were global: `prepiq_goals`,
`prepiq_weekplan`, `prepiq_favorites` and both grocery keys. On a shared device
user B could read user A's data. That was **masked** because hydration waited
for Firestore, which overwrote localStorage before anything rendered — so the
window existed but nothing was drawn in it. Making hydration synchronous
**exposes** the bug; it does not cause it. Recorded here so nobody later reads
the scoping as redesign scope creep and removes it.

**Anonymous work is adopted on first sign-in**, per key, into `prepiq_<uid>_*`:
adopt only where the account has no answer of its own, using `resolveField`'s
emptiness test — nullish and nothing else, so `[]` and `0` are answers somebody
gave. Grocery checks and exclusions are never adopted; they are transient state
about one shop on one day and the day index means nothing across a sign-in.
Idempotent by marker `prepiq_anon_adopted_<uid>` rather than by comparing
values, because a second run stops being harmless the moment the user edits
after signing in.

**Known and accepted:** keys accumulate per uid on a shared device. Sign-out
leaves both the previous account's keys and the anon keys in place, and nothing
prunes them. That is deliberate — signing out returns you to your signed-out
work — but on a device with many accounts localStorage grows without bound.
`saveLS` already fails soft on quota. Revisit if it ever bites.

**Approved:** yes.

---

## Latent: mutators are stale if called twice in one tick

Not a deviation and not a shipped bug — recorded so it is not rediscovered
as a mystery.

`toggleFavorite`, `toggleGroceryItem` and the other mutators compute the next
value from state captured at render, then write. Two calls in the same tick
therefore both start from the same snapshot and the second overwrites the
first. Found by the block-B round-trip audit, which called `toggleFavorite(7)`
and `toggleFavorite(9)` inside one `act()` and got `[9]`.

**Not reachable from the UI:** two taps are two events and two renders.

**It is the deliberate price of a fix.** Computing inside `setX(prev => …)`
would make this correct, and is exactly what was removed when every toggle was
found firing two identical `setDoc` calls under StrictMode — a state updater
must be pure. The two properties trade against each other; the current shape
picks the one whose failure is reachable.

If a caller ever needs several changes at once, add a batch action — that is
why `checkAllGrocery` takes a list rather than being called in a loop.

---

## 7. Block C: the fourth contradiction, and it is structural

The first three were a colour stop, a paint mechanism and a merge rule. This one
changes what the components ARE, so it was put to the user rather than resolved
under the standing prior. **All three resolved toward the markup**, which is now
four for four.

| Surface | README prose | Prototype markup | Built |
| --- | --- | --- | --- |
| Today macro card | 2x2 four-cell grid, 6px bars `rgba(0,0,0,0.3)` | 2 cells (KCAL, PROTEIN), 3px bars `rgba(0,0,0,0.42)`, C/F summary row | markup |
| Track macro card | "the same four-cell grid as Today" | 30px kcal + 4px bar + three stacked rows | markup |
| Sheet ingredients | name column + mono quantity column | one whole line, 14px sans, accent dot | markup |
| Fallback tile | "no icon, no initial" | initials in mono, every size | markup |
| Sheet radius | top radius 20px | `18px 18px 0 0`, on BOTH sheets | markup |

The radius was not put to the user: the two sheets in the markup agree with each
other and disagree with one line of prose, which is the same shape as the three
already ruled on.

### Three things in the prototype are NOT ported

Structure and values come from the markup. Its **logic** does not, where the
logic is measurably wrong or fabricates content.

1. **`isLabel = t.startsWith('(') || t.endsWith(')')`** classifies 581 of 4,949
   ingredient lines as section headings, and **407 of them are real
   ingredients** ending in a parenthetical — `60ml (2.1oz) Buffalo Hot Sauce (or
   hot sauce of choice)` renders as a heading. The replacement takes the yield
   form only: 107 hits, all genuine, none carrying a quantity. Both numbers are
   asserted in `recipeSheet.test.jsx` against the shipped data, so the claim is
   a test rather than this paragraph.

2. **`servings: details?.servings || 4`** prints "MAKES 4 SERVINGS" for the 88
   of 260 recipes with no servings value. That is a number the cookbook does not
   give.

3. **`prepTime(r.cal)`** derives a preparation time from the calorie count. It
   reads as extracted data and is arithmetic on an unrelated field.

2 and 3 are `Never invent, paraphrase, or substitute recipe content`. The
`generateDescription()` in the pre-redesign RecipeSheet — which built cookbook
prose out of tag lookups — is deleted for the same reason.

### The photo assumption is inverted for this app

The README builds the thumbnail rules around "most recipes have no photo".
Measured: **all 260 recipes carry an `image` path and all 260 files exist.** The
bundle was written against a thinner set. The fallback tile is kept and covered
anyway — `image` is set whether or not the file resolves, so a missing file has
nothing but the tile's error path to catch it.

### Further markup-over-prose calls in this block

Same class, not put to the user again — the ruling above settled the policy.

| Surface | README prose | Built (markup) |
| --- | --- | --- |
| Recipes row, trailing control | "button to assign the recipe to a day" | favourite heart; assigning is the sheet's ADD TO PLAN |
| Plan meal name | 13px/600 | 14px/500 |
| Today empty state | "accent button that navigates to Plan" | whole dashed block taps through |
| Today meals eyebrow | "Today's meals" | `PLANNED TODAY` |

One call went the other way, and it is the only one: **macro bar tracks use
`--pq-track-bg` / `--pq-track-shadow`, not the markup's one-off
`rgba(0,0,0,0.42)` / `inset 0 1px 2px rgba(0,0,0,0.5)`.** Same recessed channel,
0.12 apart in alpha behind a card, and the brief also says to use the existing
token layer. The 3px and 4px bar HEIGHTS are the markup's.

### Two new components

`Thumb.jsx` and the picker sheet inside `Plan.jsx`. Neither is a competing
surface primitive — Card, Sheet and Logo are still the only ones. `Thumb` holds
the 36/48/56 -> 7/9/10 mapping, which is a standing verification item; four
copies of it is four places for 48/10 to appear and never be noticed.

**Approved:** the four markup rulings, by the user. The rest recorded here.

---

## 8. Block D: quantities are in the expander, not on the row

**Handoff:** the row diagram shows `[✓] Chicken thighs   1.5 lb`, and the prose
says "Quantity: mono, right-aligned, so the column scans vertically."

**Built:** the row is checkbox + name. Quantities render in the expanded block,
each beside the recipe that asked for it.

**Why — measured, not preferred.** `1.5 lb` assumes a normalised amount field.
This catalog stores whole ingredient lines. Across one real day:

```
quantity strings on Monday :  7
length                     :  min 26, median 34, max 53 characters
under 12 characters        :  0 of 7
shortest                   :  "100g (3.5oz) Fat Free Yogurt"
rows carrying two          :  1  (chicken breast, from two recipes)
```

There is no right-hand column that holds those beside an 18px name at 375px.
The prototype markup puts them in the expander, and the user's own earlier
grocery session had already ruled the same way ("quantities on the expanded
chip"). Put to the user before building; confirmed.

**Approved:** yes.

---

## Block D pre-check: is the paren heuristic that bit block C here too?

Block C found the prototype's `isLabel` — `startsWith('(') || endsWith(')')` —
demoting 407 real ingredients to section headings. The grocery path was checked
for the same shape before block D was built, rather than assumed clean because
it is a different function.

**It carries three paren-shape rules**, all in `shopping_name()`
(`tools/build-merge-map.py`): strip a leading parenthetical, peel nested pairs,
strip any unclosed remainder. 2,048 of 4,949 ingredient lines contain a paren —
41.4%, so the rules run constantly.

**Measured: clean.** Stripping collapses ten groups of raw lines into one
shopping name, and every one is genuinely the same purchase stated twice:

| collapsed to | from |
| --- | --- |
| raw argentinian shrimp | `…Raw Argentinian Shrimp` / `…(or any shrimp)` |
| natural yogurt | `…Natural Yogurt` / `…(or any yogurt)` |
| chopped tomato | `…(400g, 14.1oz)` / `…(400g, 14oz)` |
| spicy mayo | two different bracketed recipes for the same sauce |

The failure that would have mattered — `Chicken (Thighs)` and `Chicken (Breast)`
collapsing into one item — **does not occur in the ingredient data at all**. The
distinguishing-content case exists in recipe NAMES, where it was handled
deliberately in July, and not in ingredients.

### One adjacent defect found, different cause, not fixed here

`"1 and 1/2 Green Chilli, deseeded"` (Chilli Lime Chicken) produces a catalog
item literally named **`and`**, in section Other. The green chilli is lost from
that recipe's shopping list. The cause is the mixed-number form `1 and 1/2`,
not parentheses.

Scope: one recipe, one ingredient, out of 3,990 card-item pairs. Fixing it means
a pipeline change and a catalog rebuild, which renumbers item ids and invalidates
every stored exclusion — not something to do inside the screen block that
depends on those ids. **Recorded for its own pass.** Two neighbours checked at
the same time and cleared: `ice` (from `Handful Ice Cubes` — ice is what you
buy) and `egg`, both correct.

Also noted while measuring: `byCard` holds 2 keys (385, 386) with no recipe in
`recipes.js`, leaving exactly one catalog item (`low carb tortilla wrap`)
unreachable. Harmless — `buildGroceryItems` only ever iterates real plan ids —
and in the same pass.

---

## 9. The sync banner is on Grocery only

**Built (block D):** `SyncErrorBanner` moved out of the Shell overlay into the
grocery header, between the header row and the day chips — the position agreed
in phase 0 (§3) and parked since block B because neither existed until block D.

**The consequence, accepted:** a failed write made on Plan is no longer
announced on Plan. It is **not lost** — `syncErrors` is keyed by writer and
persists until that writer succeeds or the user dismisses it — so the message is
waiting the next time Grocery opens. Delayed, not silent.

The overlay could not be reused for it: undo owns the space above the nav for
3500ms, and a failed write is exactly what happens right after a clear.

**Approved:** yes (§3, confirmed in the block D brief).

---

## The handoff contradicts itself — the prior for the fourth time

Three internal contradictions have surfaced so far — the **accent ramp** (prose
and prototype state k=0.22, the published `lift` hex implies k≈0.30), the
**shell mechanism** (prose says scroll-height, the markup paints once on a fixed
frame), and **quantity merging** (prose says total, the markup lists) — and all
three resolved toward the markup or the shipped behaviour over the prose. Treat
that as the default when the fourth appears, and check the markup first.

---

## 10. Block E: two explicit columns, not CSS `columns`

**Handoff:** the wide grocery markup lays sections out with `columns: 2`.

**Built:** sections assigned alternately to two independent column elements.

**Why.** Multi-column flow redistributes content BETWEEN columns whenever
anything above changes height, so opening an expander in one column can move
rows in the other — rows nobody touched. On phone the worst case is "things
below move"; in a flowed pair it is "things sideways move", which the row
contract has never had to survive.

And jsdom cannot measure column balancing, so the harness could neither prove
nor disprove it. The most important property in the project would have shipped
unverifiable. Two independent columns make cross-column movement structurally
impossible — the same reasoning that made the shell ramp a fixed layer: arrange
it so the question cannot arise.

Measured on real days, the alternating split lands within 13%:

| day | column A | column B |
| --- | --- | --- |
| Mon (25 rows) | 680px | 736px |
| Thu (30 rows) | 792px | 904px |

**Approved:** yes, put to the user before building.

---

## 11. The shared screen header — BUILT (was: deferred)

Deferred through block E, costed on request, then built on
`feat/shared-header`. The estimate was 6 components / 7 test files / 12
assertions; the actual was **6 components, 1 new, 2 test files touched, 1
assertion re-aimed** — lower because the header content turned out to fit three
props without any screen bending, so most tests never saw it move.

### The contract is three fields

`{ eyebrow, title, actions }`. Every titled screen declares exactly those.
`surface` selects values and `style` is layout-only — the same convention
`Card.jsx` uses — and neither is header CONTENT.

**It held for all four screens with no escape hatches.** `style` was needed
once, by Today, because a logo lockup sits above it on phone and the gap is
14px rather than 24px. A test asserts that at runtime: if a second screen ever
needs it, the contract is wrong and should be re-cut rather than widened.

### The header stays inside the screen, and that is the finding

The prototype hoists it into shared chrome. That works there because its header
content is static. **It is not static here:** Recipes' eyebrow is
`{filtered.length} OF 260 RECIPES`, and `filtered` is component-local state
derived from a search box and a filter chip. Hoisting the markup would mean
hoisting that state to App, handing App a render callback, or re-registering the
header through a context on every keystroke — the last two being exactly the
escape hatches the brief ruled out.

What §11 was actually for is bought either way: one definition of the bar, one
place for `headPad`, and the rule spanning both columns. The header renders
ABOVE the screen's grid with its own horizontal padding, so the 1px
`rgba(255,255,255,0.09)` runs the full content width rather than stopping at
the first column. A test asserts the header is a SIBLING of the grid, not a
child of a column — which is the thing that was visibly wrong.

### Duplicated chrome, surface-conditional

Today's logo lockup and settings gear are hidden on wide: the rail carries the
lockup, and Goals is its own destination there. Two `[IQ]` tiles on one screen
is the app saying twice where you are. **Conditional, not deleted** — the phone
has no rail and would lose its only wordmark and its only route to Settings.

Grocery is untouched: no `<h1>`, its sticky bar is a control, and it had just
come through block D.

**Approved:** yes.

---

## 11a. Superseded — the original deferral note

**Handoff:** the wide prototype hoists a shared content header — eyebrow, `h1`,
and page actions — above the body, outside each screen.

**Built:** every screen keeps the header it already has; only the BODY gains
columns, and the gutter widens through one token.

**Why:** the screens' headers were built and covered in block C. Hoisting them
into shared chrome is a five-screen refactor with no visual difference at the
sizes involved — the same eyebrow, the same 28px title, the same actions, one
DOM level up. It buys nothing and puts five passing screens back in play in the
last block. The handoff's own rule for this block is "only the layout and the
affordance sizes" change, and this satisfies it.

**Not approved separately** — recorded as a scoping call.

### Costed, on request

| | |
| --- | --- |
| Components changed | **6** — `Today`, `Plan`, `Recipes`, `Track` lose their header block; `App` renders it and supplies eyebrow/title/actions per tab; `Shell` gains a header slot above the scroller |
| Components untouched | `Grocery` — it has no `<h1>`; its sticky bar is a control, not a title |
| Test files touched | **7** |
| Assertions to re-aim | **12** |
| `it` blocks in those files | 103 — most do not touch the header and would not move |

The work is not the markup, it is that per-tab header CONTENT becomes App's
concern: Plan's SHUFFLE button, Track's LOG button, Today's settings gear and
the recipe count on Recipes all currently live beside their own titles. A shared
header needs each screen to declare `{eyebrow, title, actions}` — which is a
prop contract across five screens, not a move.

**What it buys:** a full-width bar with `border-bottom: 1px rgba(255,255,255,0.09)`
and `headPad: 24px 32px 20px`, so the title sits above a rule that spans both
columns instead of floating in the left one. That is the largest remaining
visual gap from the prototype.

**What is already done without it:** the 34px title at desktop, and the
`bodyPad` horizontal values, both arrive through tokens.

---

## 12. Block E: the gate line about photoless lists is dropped

The standing verification carried "a mostly-photoless list must read as a calm
column". Block C measured the data: **all 260 recipes carry an `image` path and
all 260 files exist.** The condition does not occur, so the line tested nothing.

The fallback tile itself is kept and covered — `image` is set whether or not the
file resolves, so a missing file has nothing but the tile's error path to catch
it. What is dropped is the assertion about a list that cannot happen.

---

## 13. Local-only mode — a fix on main, not preview scaffolding

**Not a deviation from the handoff.** A defect that was on `main`, found while
preparing a preview deploy, fixed as a defect.

### The bug

With no Firebase configuration the app called `initializeApp` with six
`undefined`s, handed the resulting app to `getAuth`, and waited for an
`onAuthStateChanged` that could never fire. `App.jsx` gates on
`user === undefined && !bootScope`, so a first-time visitor **sat on the
spinner for ever**, with nothing on screen saying why — while every screen's
data was already on the device, because block B made hydration local-first.

### The fix

`cloudEnabled` is computed once at module load from the config alone. When it
is false: `initializeApp` is never called, no auth subscription is made, `user`
resolves to `null` on the first render, every write stays local, and the Auth
screen is skipped — there is no account to sign in to, so offering the control
would be offering one that cannot succeed.

### The safety property, which matters more than the fix

**The mode is reachable by config absence and by nothing else.** A fallback that
fired on a *failed call* would turn a flaky connection, an expired token or a
Firestore outage into a silent, permanent stop-syncing: the user keeps working
and nothing reaches their account. So the decision is made from a value that
cannot change at runtime, before any network call exists to fail. `syncErrors`
remains the only thing that reports failed calls.

Asserted twice — on the rule (`cloudEnabled` assigned exactly once; no `catch`
in either file) and on behaviour: a store built **with** a cloud whose every
request rejects still reports through `syncErrors`, still retries, and still
has `cloudEnabled === true`.

`isConfigComplete` lives in `firebaseConfig.js`, which imports nothing and does
nothing, so a test can exercise it without initialising an app. The first
version imported it through `firebase.js` and ran `initializeApp` against
whatever was in the developer's `.env` — Vite loads `.env` in test mode too.
That is a unit test one typo away from touching a live project.

### It is visible

Settings carries a `LOCAL ONLY` block: *"NO ACCOUNT CONNECTED. EVERYTHING IS
SAVED TO THIS DEVICE AND NOTHING SYNCS."* A local-only build that looked
identical to a signed-in one is how someone reviews the wrong thing, or reports
"sign-in is broken" about a build never given a cloud.

**Known coverage gap, stated:** the `!cloudEnabled` guard inside `cloudWrite` is
redundant today — in local-only mode `user` is always `null`, so the existing
`!uid` check catches every call first. Removing it does not fail any test. It is
kept as defence in depth against a future path that sets `user` without a
cloud, not because it is load-bearing now.

---

## 14. `.env` was being uploaded to Vercel on every deploy

Found while checking whether a preview build could reach production Firestore.
**Not preview-specific — it was true of every deploy this project has made.**

The Vercel CLI's built-in upload ignore list is:

```
.hg .git .gitmodules .svn .cache .next .now .vercel .npmignore .dockerignore
.gitignore .*.swp .DS_Store .wafpicke-* .lock-wscript
.env.local  .env.*.local
.venv .yarn/cache .pnp* npm-debug.log config.gypi node_modules __pycache__ venv CVS
```

It ignores `.env.local` and `.env.*.local`. **It does not ignore a plain
`.env`** — and `.gitignore` is itself on that list, so a file being gitignored
buys nothing: it is neither uploaded nor consulted for upload rules. This
project's file is a plain `.env` holding live Firebase credentials.

Read out of the installed CLI's own `getVercelIgnore` rather than tested by
deploying. `.env` and `.env.*` are now in `.vercelignore`, with the list quoted
above it so the next person does not have to re-derive it.

---

## 15. There is one Firebase project, and preview shares it

Vercel has the six `VITE_FIREBASE_*` variables scoped to **Production only**;
there is no second Firebase project anywhere in this repo. A preview build
therefore has no credentials of its own.

Preview environments now carry all six names with **empty values**, so a preview
build lands in local-only mode deterministically rather than depending on
whether `.env` happened to be uploaded. Every screen is explorable from
localStorage; sign-in is unavailable and says so.

**Still open:** if preview ever needs a working cloud, it needs its own Firebase
project. Pointing it at production would let an unmerged branch run block B's
`CHECKS_VERSION 3` / `EXCLUDED_VERSION 3` resets against real user data.

---

## 16. Block F: no meal slots, so the eyebrow is positional

**Spec:** the group eyebrow reads `DINNER · 9 ITEMS`, and groups run in
"meal order (breakfast → lunch → dinner → snacks, matching the app's own
order)".

**Built:** `MEAL 1 · 9 ITEMS`, 1-based, in `day.ids` order. A recipe
planned twice reads `MEAL 1 · ×2 · 9 ITEMS`.

**Why — the data has nothing else to say.** `weekPlan` is seven
`{ day, ids: [recipeId|null, …] }`. `ids` is flat and positional; `slot`
in `Plan.jsx`, `Today.jsx` and `Track.jsx` is its array index and
nothing more. No recipe carries a `meal` field, and the tags are
macro/ingredient categories (`high-protein`, `chicken`, `pasta`) with no
meal among them. "The app's own order" IS position — there is no other
order to match.

Naming the positions `Breakfast`/`Lunch`/`Dinner` would invent data: it
would claim `ids[0]` is breakfast, which nothing in the plan, the UI or
the user's behaviour establishes. Adding a real slot field was
considered and rejected by the user — it is a change to the plan model
and to three other screens, not a grocery change.

**Approved:** yes — decision 1.

---

## 17. Block F: the second pill is AISLES, and it never was a week

**Spec:** "An eighth pill *WEEK* after SUN … shows the existing
consolidated store-walk list unchanged."

**Built:** the pill sits after SUN as drawn, and it reads **AISLES**. It
toggles a reading rather than joining a mutually exclusive set: the day
pills keep showing the selected day whatever the mode, so two pills are
lit at once — `TUE`, and `AISLES`.

**Why the name changed.** The spec was written against an assumption
that the old grocery screen showed a week-wide list. **It never has.**
Block B made the derivation day-scoped: `buildGroceryItems` takes a
`dayIndex`, Clear is day-keyed, and the counts are one day's (§4). A
pill labelled WEEK would have named a list that has only ever shown a
day.

What the two pills actually select is not a range but an ORDER — the
same day's items, grouped **by meal** or walked **by aisle**. `AISLES`
says that; `WEEK` said something untrue.

**Why it toggles rather than excluding the day pills.** Mutually
exclusive pills would leave nothing lit on MON…SUN while the aisle view
was up, and the day is the one fact that reading most needs to carry —
it is *Tuesday's* aisles.

**A real seven-day list is a separate, unbuilt feature.** Nothing in
this block aggregates across days. It would need its own derivation —
`buildGroceryItems` runs per day and merges within one — plus decisions
this block never faced: whether a week's exclusions are seven day-keyed
sets or one week-wide set, what Clear means when an item is due on
three days, and how quantities from seven days read on one row when they
are already whole ingredient lines (§8, §19). None of that is implied by
what is here, and none of it is started.

**Approved:** yes — renamed on review.

---

## 18. Block F: the wide side pane no longer picks the day

**Built before:** on tablet and desktop the day list lived in the side
pane beside the list, where there was room for full day names; the
header carried day chips on phone only.

**Built now:** the pills are in the sticky header on every surface, per
the spec's four frames, and the side pane's day list is gone. The pane
keeps the day name and the progress readout.

**Why.** The day view puts the selector in the header on all four
frames. Keeping the pane's list as well would leave two controls for one
choice on the wide surfaces — and the failure mode of two controls is
that one of them stops being updated. The list component itself is
untouched, which is what "unchanged" was protecting; this is chrome.

---

## 19. Block F: the row keeps 18px and 56px

**Spec:** item name sans 600 **16px**; row height ~**46px** (item 6
explicitly anticipates "row height may change from 56px to the mockup's
~46px").

**Built:** unchanged — `--pq-size-grocery: 18px`, `--pq-row-grocery:
56px`, and the same two-button row, because the day view uses the
**same component** as the consolidated list (`GroceryRow`, lifted out of
`Grocery.jsx` verbatim).

**Why.** Both values are load-bearing and already argued:

- 18px is marked *"GROCERY ITEM NAME — do not reduce"* in `tokens.css`
  and restated in the phase plan ("Name 18px minimum, weight 500. Do not
  reduce"). It was measured against all 577 catalog items at 375px.
- 56px is the standing verification line ("grocery rows 56px"), and the
  whole-row tap target is ~6× the 44px floor by area. 46px would still
  clear the floor, so this is not a safety call — it is that the row is
  used one-handed, walking, in a shop.

Taking the mockup's values would also have meant a second row
implementation, since the consolidated list keeps the old ones — and two
rows that must stay in step by hand is how the no-reflow contract gets
broken quietly.

**Quantity is not on the row either**, for the reason already recorded
in §8 — and re-measured across the whole catalog for this block, where
it is worse than §8 states: **76% of the 4,025 card-item pairs carry no
quantity line at all** (`quantitySections` limits them to three
sections), and the 1,009 that exist run 6 to **127** characters, median
35, with ten under twelve. A right-aligned column beside a 16px name in
a 283px grid cell cannot hold those. `groupsForDay` still returns
`quantity` in the item shape; the expander renders it.

**Approved:** yes — decision 3.

---

## 20. Block F: one palette, and the screen reads warmer than the mockup

**Spec tokens:** accent `#c6f000`, titles `#ffffff`, item names
`#e8ecef`, muted `#8d99a3`, sans `'Source Sans 3'`, mono
`'IBM Plex Mono'`.

**Built:** mapped onto the existing theme, with **no new token added** —
`tokens.css` is untouched by this block and `designTokens.test.js`
passes unchanged.

| Spec | Value | Token used |
|---|---|---|
| Accent | `#c6f000` | `--pq-accent` `#D0F224` |
| Item name | `#e8ecef` | `--pq-text` `#F2F5EE` |
| Muted | `#8d99a3` | `--pq-text-muted` `#9BA398` |
| Row divider | `rgba(255,255,255,.06)` | `--pq-rule-row` — exact |
| Eyebrow size | 10px | `--pq-size-label` — exact |
| Eyebrow tracking | `.14em` | `--pq-track-section` — exact |
| Sans | Source Sans 3 | `--pq-sans` = IBM Plex Sans |
| Mono | IBM Plex Mono | `--pq-mono` — exact |

**Two consequences, both accepted.**

The greys differ in hue, not just in value: the mockup's are cool
blue-greys, the app's are the warm green-greys of the graphite and
chartreuse redesign. So **the screen reads warmer than the frames do**,
everywhere, by design — that is what "do not introduce a second palette"
costs, and it is the right cost.

Source Sans 3 is not loaded. Adding it would undo block E's font work —
14 woff2 down to 7, 144K — to gain a second sans that differs from IBM
Plex Sans by less than the screen's own grey shift.

**One addition that is not a token:** `Thumb`'s `SIZES` map gained
`88: { radius: 10, font: 20 }` for the phone group photo. The map is one
definition on purpose (36/7, 48/9, 56/10 is a standing verification
item); adding the fourth entry there rather than inlining a box at the
call site is what stops `88/10` quietly becoming `88/14` on one screen.
The wide surfaces' photo is a 340×210 / 280×180 panel rather than a
square and passes its box in `style`.

**Approved:** yes — decision 8.

---

## 21. Block F: one set of checks, not a second key space

**Phase 2 built** a third key space, `dayIndex:instanceId:itemId`, so an
ingredient appearing in two of a day's recipes could be checked under
one and not the other. It lived in local UI state, and phase 3 was to
persist it.

**Phase 3 deleted it.** Both readings show the same day's items, so the
day view reads and writes the existing `dayIndex:itemId` check Set, the
existing exclusions and the existing `CHECKS_VERSION`. `groupItemKey` is
gone from `src/lib/groceryByDay.js`.

**Why — it was modelling the screen, not the shop.** Two rows for
chicken breast under two recipes are one thing in one basket. Ticking it
under the wrap and finding it still unticked under the curry would mean
buying it twice, or standing in the aisle working out which of two
identical rows was the real one. The question the row answers is "is
this in the basket", and the basket does not know which recipe asked.

It also made the two readings disagree about the same day: with separate
keys, `N LEFT` would have counted rows in one view and items in the
other, and the aisle view could read *All done* while the day view still
showed unchecked rows. Same day, same shop, two answers.

**What the instance id is for now:** a React key and the `MEAL n` label.
Nothing else. That resolves the open question at the end of phase 2 —
`instanceId` is `${recipeId}#${position}`, so reordering a day's meals
moves it, and **nothing follows it**, because no stored key contains it.
A test asserts the stored key matches `/^\d+:\d+$/` and carries no `#`.

**One thing IS still per-instance:** which expander is open. Opening
"chicken breast" under one recipe must not open it under the other —
that is a disclosure about a row, not a fact about the basket.

**No version bump.** `CHECKS_VERSION` and `EXCLUDED_VERSION` stay at 3.
A bump exists to invalidate stored keys whose meaning changed; nothing
new is persisted and no existing key changed shape, so bumping would
reset real user data to mark a change that did not happen.

**Approved:** yes — decision B.

---

## Baselines

Recorded so drift is visible later.

| Metric | Value | When |
| --- | --- | --- |
| Font payload, both families | 14 woff2 in `dist/assets` | phase 1 |
| Font payload, after migration | **7 woff2, 144K** | block E |
| Plus Jakarta + DM Mono removal | **done** — uninstalled, not just unimported | block E |
