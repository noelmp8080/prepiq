# PrepIQ

Meal planning and a grocery list, built to be used on a phone in a shop.

## The catalog pipeline

The grocery list is derived from two cookbooks by a five-stage pipeline
in `tools/`. It reads the PDFs by FONT rather than by text — a bullet
span opens an ingredient, `DMSans-Light` is its text, anything else is a
heading — because a flat text pass cannot tell an ingredient from the
heading above it.

```
source-pdfs/*.pdf
  |
  |  extract-ingredients.py      THE ONLY STEP THAT NEEDS THE PDFs
  v
tools/extracted/ingredients.json          <- COMMITTED
  |
  |  split-compounds.py          one line holding several ingredients
  v  build-merge-map.py          variants -> one row per purchase
  |  build-section-map.py        assign an aisle
  |  emit-grocery-catalog.py
  v
src/data/groceryCatalog.json              <- COMMITTED, what the app imports
```

Run them in that order from the repo root. `_guard.py` refuses to write
any file containing a control character and scans the tools' own source;
run it after any change.

### Where the source PDFs live

**Not in this repo, and never have been.** They are 298MB and 139MB —
each over Vercel's 100MB per-file limit — and they are copyrighted
cookbooks. `source-pdfs/` is gitignored and `.vercelignore`d.

Keep them locally at:

```
source-pdfs/Jalal's Cookbook V3.pdf
source-pdfs/The Meal Prep Cookbook V5.pdf
```

**You only need them for a font-level re-extraction** — a new edition, a
re-typeset layout, or a change to how spans are classified. Everything
downstream runs from the committed `tools/extracted/ingredients.json`,
so a fresh clone can rebuild the whole catalog without them:

```
python tools/split-compounds.py
python tools/build-merge-map.py
python tools/build-section-map.py
python tools/emit-grocery-catalog.py
python tools/_guard.py
```

That matters because the scripts carrying the judgement — the seasoning
vocabulary, the section map, the named exclusions and hand-splits, the
cookbook typo map — are the ones that will need revisiting, and none of
them should depend on one machine holding 437MB of cookbooks.

### What fails loudly

Three checks exist because their failure mode is silence:

- `check_typos_still_apply` — a cookbook typo the map corrects must still
  be present. A correction that corrects nothing hides the next real one.
- `check_named_lines_still_apply` — every exclusion and hand-split is
  keyed on exact text. Change one comma upstream and it silently stops
  matching; junk reappears on the list months later.
- `_guard.py` — a `` written in a non-raw Python string is a backspace,
  and the pattern then silently matches nothing. This has happened five
  times in this project, every time inside a script rather than its
  output.

## Development

```
npm install
npm run dev
npm test
npm run build
```

---

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
