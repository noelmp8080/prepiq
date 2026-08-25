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

## The handoff contradicts itself — the prior for the fourth time

Three internal contradictions have surfaced so far — the **accent ramp** (prose
and prototype state k=0.22, the published `lift` hex implies k≈0.30), the
**shell mechanism** (prose says scroll-height, the markup paints once on a fixed
frame), and **quantity merging** (prose says total, the markup lists) — and all
three resolved toward the markup or the shipped behaviour over the prose. Treat
that as the default when the fourth appears, and check the markup first.

---

## Baselines

Recorded so drift is visible later.

| Metric | Value | When |
| --- | --- | --- |
| Font payload, both families | 14 woff2 in `dist/assets` | phase 1 |
| Plus Jakarta removal | block E, once the last component migrates | pending |
