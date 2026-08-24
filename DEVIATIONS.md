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

Second, and unresolved — see the open question below.

**Approved:** yes, hardcoded ramp. The *values* are an open question.

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

## Open question — which accent ramp is correct

**Not yet decided. The shipped values are the handoff's.**

The handoff's README and its `tokens.css` both give the ramp as literals. The
prototype computes it at runtime from `#D0F224` with a linear-RGB `shade()`.
Running the prototype's own function on the prototype's own accent does not
produce the documented values:

```
              prototype renders   README / tokens.css
shade(+0.22)  #DAF554             #DDF667      blue out by 19
shade(-0.26)  #9AB31B             #99B31B      red out by 1
shade(+0.70)  #F1FBBD             #F2FCBE      green and blue out by 1
shade(-0.42)  #798C15             #798C15      match
```

So the two artifacts that claim to be "taken from the prototypes" disagree with
the prototype's rendered output on three of four derived stops. The visible one
is the lightest stop of the accent gradient — `#DAF554` is a flatter yellow,
`#DDF667` a lighter lime.

Two defensible readings:

- **The documents win.** The handoff states its values are authoritative, and
  two separate files agree with each other. This is what is shipped.
- **The prototype wins.** The rendered pixels are what a designer looked at and
  approved; the tables are a hand transcription that drifted.

This needs a human decision. It is a one-file change either way, since every
consumer reads `var(--pq-accent-*)`.

---

## Baselines

Recorded so drift is visible later.

| Metric | Value | When |
| --- | --- | --- |
| Font payload, both families | 14 woff2 in `dist/assets` | phase 1 |
| Plus Jakarta removal | block E, once the last component migrates | pending |
