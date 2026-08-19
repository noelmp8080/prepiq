# PrepIQ — structure-aware ingredient extraction, keyed on PAGE NUMBER.
#
# WHY THIS EXISTS
# The ingredients already in prepiq-recipe-details.json came from a flat
# get_text() pass. Flat text cannot tell an ingredient from the heading
# above it, so 13% of the 4,949 stored lines are section headings
# ("To Assemble", "Glaze"), instructions ("Distribute into 4 equal
# servings") and OCR debris ("» Continue", 76 times). Roughly half of a
# week's shopping list would have been noise.
#
# The PDFs carry full structure and the flat pass threw it away:
#
#   Jalal                              Meal Prep
#   ─────                              ─────────
#   'Ingredients'      16.0            'INGREDIENTS (N SERVINGS)'  16.0 bold
#   'Crispy Chicken:'  10.0 Regular    'Chicken Marinade'          11.0 Regular
#   Wingdings 'z'       7.0  = bullet  en-dash '–'                10.0  = bullet
#   ingredient text     9.5 LIGHT      ingredient text            10.0 LIGHT
#   'How to make'      16.0  = end     'INSTRUCTIONS'             16.0  = end
#
# The rule is the same in both books: a BULLET span opens a new
# ingredient, DMSans-Light is ingredient text, consecutive Light spans
# with no bullet between them are one hard-wrapped line, and anything
# else inside the region is a section heading. Font name does the work.
#
# KEYED ON PAGE, NOT NAME
# Name matching is what broke here before. Five dishes appear twice in
# the books as different versions, so their names collide; the key
# format documented in prepiq-recipe-details.json._meta additionally
# stripped /\bv\d+\b/, which collapsed "X" and "X V2" onto one key.
# That normaliser exists ONLY as a documentation string — no committed
# tool implements it and nothing in this repo writes that JSON, so the
# minting script was never checked in. Rather than reconstruct it, this
# pass keys on (book, page): a page is unambiguous and cannot collide.
# Same lesson as recipeDetailKeys.js replacing name-matching with an
# explicit id map.
#
# DRINKS ARE OUT OF SCOPE (user decision, 2026-08-19)
# Jalal pages 131-135 and 137 are smoothies and a summer refresher:
#   131 Red Smoothie                134 Skin Health & Hydration Smoothie
#   132 Reduce Bloating Smoothie    135 Gut Health and Digestion Smoothie
#   133 Gut Health & Smoothie       137 Grenadine Summer Refresher
# They are in neither recipes.js nor the details JSON and never have
# been. They are excluded deliberately, not missed: the card format
# carries per-serving macros these pages do not print. Whether to add
# smoothies later is a card-format question, not an extraction one.
# Recorded here so the next reader finds a decision rather than a bug.
#
# ONE CARD PER DISH, UNLESS THE VERSIONS ARE DIFFERENT DISHES
# (user decision 2026-07-09, refined 2026-08-19)
#
# The original rule was "one card per dish, latest version", which
# excluded five older variant pages. The refinement: a variant earns its
# own card when the two are meaningfully different DISHES rather than
# drafts of one — and it must be nameable in a way that helps you choose
# from a list. "(V1)" and "(V2)" do not qualify.
#
#   RESTORED — different dishes, readable names:
#     Chicken Shawarma Rice Bowls (Thighs)   p52   1000g chicken thighs
#     Chicken Shawarma Rice Bowls (Breast)   p106   750g chicken breast
#       ^ the worked example: a protein swap is a different meal.
#     Breakfast Pizza (Low Carb)             p109  low carb tortilla,
#                                                  low fat cheese, bell
#                                                  pepper/red onion
#     Breakfast Pizza (Wholemeal)            p119  wholemeal tortilla,
#                                                  mozzarella, spinach
#       ^ ~3 of 10 ingredients shared; the base is named in the book.
#
#   HELD — supersessions, not dishes. Quantity tweaks and wording:
#     Creamy Garlic Cheesy Chicken & Potatoes  p40 held, p148 kept
#     Chicken Fajita Mac n Cheese              p102 held, p54 kept
#     Healthy Pad Thai                         p61 held, p45 kept
#
# FAILS LOUDLY. Any parsed page that cannot be mapped to exactly one
# card id, or any card id that cannot be mapped to exactly one page, is
# printed with page and title and exits non-zero. Attaching ingredients
# to the wrong meal is the one failure nobody would catch by looking at
# the screen, so it must stop the run rather than be skipped.

import fitz, re, json, io, sys
sys.path.insert(0, __import__('os').path.dirname(__file__))
import _guard
from collections import Counter

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

DETAILS = 'src/data/prepiq-recipe-details.json'
KEYS    = 'src/data/recipeDetailKeys.js'
OUT     = 'tools/extracted/ingredients.json'

JALAL    = "source-pdfs/Jalal's Cookbook V3.pdf"
MEALPREP = "source-pdfs/The Meal Prep Cookbook V5.pdf"

DRINK_PAGES = {131, 132, 133, 134, 135, 137}        # jalal, see header
HELD_PAGES  = {('mealprep', 40), ('mealprep', 102), ('jalal', 61)}

# RENAME, NOT ADD. The existing card already holds one of the two
# versions — card 49 holds p106, card 276 holds p119 — so restoring both
# as new cards would leave the originals behind as duplicates. Each pair
# is one rename plus one addition. The page is PINNED here rather than
# matched, because reserving it for a new card is exactly what left the
# original matching nothing: card 49 scored 0.47 against "Buffalo
# Chicken Potato Bowls" on the first run, and the loud failure caught it.
RENAME = {                       # existing id -> (book, page), new name
    49:  (('mealprep', 106), 'Chicken Shawarma Rice Bowls (Breast)'),
    276: (('jalal',    119), 'Breakfast Pizza (Wholemeal)'),
}

# NEW CARDS. Ids start at 385: the catalog runs 1-384 with gaps and
# build-catalog.mjs never reuses a retired id, so 261-264 are all taken.
ADD = {                          # new id -> (book, page), name
    385: (('mealprep',  52), 'Chicken Shawarma Rice Bowls (Thighs)'),
    386: (('jalal',    109), 'Breakfast Pizza (Low Carb)'),
}

BOOKS = {
    'jalal': dict(
        path=JALAL,
        start=re.compile(r'^Ingredients\b'),
        end=re.compile(r'^How to make\b'),
        light='DMSans-Light',
        is_bullet=lambda t, f: f == 'Wingdings-Regular' or t == 'z',
        title=lambda sp: ' '.join(t for t, f, s in sp if f.startswith('BingoDilan') and s >= 20).strip(),
    ),
    'mealprep': dict(
        path=MEALPREP,
        start=re.compile(r'^INGREDIENTS\b'),
        end=re.compile(r'^INSTRUCTIONS\b|^IMPORTANT\b'),
        light='DMSans-Light',
        is_bullet=lambda t, f: t in ('–', '-', '•'),
        title=None,                                  # title lives on the previous page
    ),
}

BULLET_CHARS = '–—-•'
# A quantity fragment: digits, ASCII fractions and vulgar-fraction glyphs,
# nothing else. Section headings never look like this.
QTY_ONLY = re.compile(r'^[\d\s/½¼¾⅓⅔⅛⅜⅝⅞.,-]*[\d½¼¾⅓⅔⅛⅜⅝⅞][\d\s/½¼¾⅓⅔⅛⅜⅝⅞.,-]*$')


def spans(page):
    out = []
    for b in page.get_text('dict')['blocks']:
        if b.get('type') != 0:
            continue
        for line in b['lines']:
            for s in line['spans']:
                t = s['text'].strip()
                if t:
                    out.append((t, s['font'], round(s['size'], 1)))
    return out


def join_span(acc, add):
    """Append a span to an accumulating line.

       Normally space-separated, but NOT when a number is split across
       two spans: the PDF emits "800g" as "8" + "00g" on one recipe, and
       a naive join produces "8 00g" — a quantity that reads as 8 rather
       than 800. Digits either side of the seam mean one number."""
    acc, add = acc.strip(), add.strip()
    if not acc:
        return add
    if not add:
        return acc
    if acc[-1].isdigit() and add[0].isdigit():
        return acc + add
    return acc + ' ' + add


def parse_page(sp, cfg):
    """Return (servings_note, [{'section':…, 'text':…}]) or (None, []) if this
       page has no ingredients region."""
    si = next((k for k, s in enumerate(sp) if cfg['start'].search(s[0])), None)
    if si is None:
        return None, []
    ei = next((k for k, s in enumerate(sp) if k > si and cfg['end'].search(s[0])), len(sp))

    servings = None
    m = re.search(r'\(([^)]*servings?[^)]*)\)', sp[si][0], re.I)
    if m:
        servings = m.group(1).strip()

    items, section = [], None
    for t, f, size in sp[si + 1:ei]:
        # THE BULLET MAY CARRY THE QUANTITY WITH IT. Meal Prep emits
        # "– ½" as ONE span, and an exact-match bullet test misses it —
        # no item opens, and the ingredient text lands on the PREVIOUS
        # line. That is how "150g White Onion, thinly sliced" acquired
        # "Tsp each: Salt, Garam Masala, Paprika, Turmeric".
        rest = t
        opened = False
        if not (f == cfg['light']):
            stripped = rest.lstrip(BULLET_CHARS + ' ')
            if len(stripped) < len(rest) and cfg['is_bullet'](rest[0], f):
                items.append({'section': section, 'text': '', '_src': []})
                opened, rest = True, stripped
        if cfg['is_bullet'](t, f) and not opened:
            items.append({'section': section, 'text': '', '_src': []})
            continue
        if opened and not rest:
            continue

        if f == cfg['light']:
            # A Light span with no bullet before it is the wrapped
            # remainder of the previous line, not a new ingredient.
            if items:
                items[-1]['text'] = join_span(items[-1]['text'], t); items[-1]['_src'].append(t)
            continue

        # A QUANTITY FRAGMENT IN THE HEADING FONT. Fractions render as
        # their own span — sometimes the glyph "½", sometimes ASCII "1/2"
        # at a larger size. Treated as a heading, the number is silently
        # dropped and "½ Tsp each: Salt" becomes "Tsp each: Salt". A
        # quantity that vanishes without trace is the worst failure this
        # file can produce, so anything that is only digits and fraction
        # marks belongs to the current ingredient, never to the section.
        if QTY_ONLY.match(rest.strip()) and items:
            items[-1]['text'] = join_span(items[-1]['text'], rest); items[-1]['_src'].append(rest)
            continue
        if opened:
            items[-1]['text'] = join_span(items[-1]['text'], rest); items[-1]['_src'].append(rest)
            continue
        if servings is None:
            m = re.search(r'\(([^)]*(servings?|makes|for)[^)]*)\)', t, re.I)
            if m:
                servings = m.group(1).strip()
                continue
        section = t.rstrip(':').strip()
    return servings, [i for i in items if i['text']]


def extract_book(book):
    cfg = BOOKS[book]
    doc = fitz.open(cfg['path'])
    # Meal Prep prints the title on a "Recipe # N" page before the
    # ingredients page; Jalal prints it on the same page.
    titles = {}
    if cfg['title'] is None:
        for i in range(doc.page_count):
            sp = spans(doc[i])
            if re.search(r'Recipe\s*#\s*\d', ' '.join(t for t, _, _ in sp)):
                titles[i] = ' '.join(
                    t for t, f, s in sp
                    if f.startswith('BingoDilan') and s >= 20 and not re.match(r'Recipe\s*#', t)
                ).strip()

    pages = []
    for i in range(doc.page_count):
        sp = spans(doc[i])
        servings, items = parse_page(sp, cfg)
        if not items:
            continue
        if book == 'jalal' and i in DRINK_PAGES:
            continue
        if (book, i) in HELD_PAGES:
            continue
        if cfg['title'] is not None:
            title = cfg['title'](sp)
        else:
            owner = max([p for p in titles if p <= i], default=None)
            title = titles.get(owner, '')
        pages.append({'book': book, 'page': i, 'title': title,
                      'servings': servings, 'items': items})
    return pages


def tokens(lines):
    return set(w for l in lines for w in re.findall(r'[a-z]+', l.lower()))


def title_matches(title, key_name):
    """Loose agreement between a page's printed title and a catalog key.
       Deliberately loose: it is corroboration, never the decision."""
    def norm(s):
        drop = {'and', 'n', 'the', 'with', 'a', 'of'}
        return set(w for w in re.findall(r'[a-z0-9]+', s.lower()) if w not in drop)
    a, b = norm(title), norm(key_name)
    if not a or not b:
        return False
    return len(a & b) / max(1, len(a | b)) >= 0.7


def main():
    details = json.load(io.open(DETAILS, encoding='utf-8'))['recipes']
    keysrc = io.open(KEYS, encoding='utf-8').read()
    id_to_key = {int(a): b for a, b in re.findall(r'(\d+)\s*:\s*"([^"]+)"', keysrc)}

    pages = extract_book('jalal') + extract_book('mealprep')
    print(f'parsed {len(pages)} ingredient pages '
          f'({sum(1 for p in pages if p["book"]=="jalal")} jalal, '
          f'{sum(1 for p in pages if p["book"]=="mealprep")} mealprep)')

    # ── Map page -> card id by ingredient-content similarity ──────────
    # The stored ingredients came from these same pages, so the true
    # match scores far above every rival. Similarity, not name.
    new_pages = {pk for pk, _ in ADD.values()}
    pinned = {cid: pk for cid, (pk, _) in RENAME.items()}
    reserved = new_pages | set(pinned.values())
    assignable = [p for p in pages if (p['book'], p['page']) not in reserved]

    scores = {}
    for cid, key in id_to_key.items():
        if cid in pinned:
            continue
        entry = details.get(key)
        if entry is None:
            continue
        stored = tokens(entry['ingredients'])
        kbook, kname = key.split('::', 1)
        best, second, bestp = 0.0, 0.0, None
        for p in assignable:
            # SAME BOOK ONLY. Not an optimisation — a correctness guard.
            # Both cookbooks print several of the same dishes, so the
            # catalog carries two legitimate cards for "Honey BBQ Chicken
            # Mac & Cheese", one per book. Unconstrained, each card's true
            # page beat the OTHER book's version of the same dish by as
            # little as 0.19 on ingredient text alone — separated by
            # coincidence rather than by anything that had to be true.
            # The key already records the book; using it makes a
            # cross-book mix-up impossible instead of merely unlikely.
            if p['book'] != kbook:
                continue
            t = tokens(i['text'] for i in p['items'])
            j = len(stored & t) / max(1, len(stored | t))
            # TITLE CORROBORATION. The stored ingredients are the OLD noisy
            # extraction — they carry headings and split wraps that this
            # pass removes — so a correct match can score as low as 0.49
            # purely because the two texts differ by the noise being
            # fixed. The printed title is independent evidence, so
            # agreement lifts the score rather than replacing it. Never
            # sufficient alone: five titles legitimately collide, which is
            # the entire reason this maps on page rather than name.
            if title_matches(p['title'], kname):
                j += 0.25
            if j > best:
                best, second, bestp = j, best, p
            elif j > second:
                second = j
        scores[cid] = (bestp, best, second)

    failures = []
    page_claims = Counter()
    mapping = {}
    for cid, (p, best, second) in sorted(scores.items()):
        if p is None:
            failures.append(f'card {cid} ({id_to_key[cid]}): no page matched at all')
            continue
        if best < 0.55:
            failures.append(f'card {cid} ({id_to_key[cid]}): best match only {best:.2f} '
                            f'-> {p["book"]} p{p["page"]} {p["title"]!r}')
            continue
        if best - second < 0.15:
            failures.append(f'card {cid} ({id_to_key[cid]}): AMBIGUOUS, best {best:.2f} vs '
                            f'runner-up {second:.2f} -> {p["book"]} p{p["page"]} {p["title"]!r}')
            continue
        mapping[cid] = (p['book'], p['page'])
        page_claims[(p['book'], p['page'])] += 1

    for pk, n in page_claims.items():
        if n > 1:
            who = [c for c, v in mapping.items() if v == pk]
            failures.append(f'page {pk} claimed by {n} cards: {who}')

    unclaimed = [p for p in assignable if (p['book'], p['page']) not in page_claims]
    for p in unclaimed:
        failures.append(f'UNMAPPED page {p["book"]} p{p["page"]} {p["title"]!r} '
                        f'({len(p["items"])} ingredients) — no card claims it')

    for cid, (pk, name) in list(RENAME.items()) + list(ADD.items()):
        if not any((p['book'], p['page']) == pk for p in pages):
            failures.append(f'restore target {pk} -> id {cid} {name!r} was not parsed')
        if cid in ADD and cid in id_to_key:
            failures.append(f'new id {cid} is already in use by {id_to_key[cid]!r}')
        mapping[cid] = pk

    if failures:
        print(f'\nFAILED — {len(failures)} problem(s):')
        for f in failures:
            print('  ' + f)
        sys.exit(1)

    renamed = {cid: n for cid, (_, n) in RENAME.items()}
    renamed.update({cid: n for cid, (_, n) in ADD.items()})
    by_page = {(p['book'], p['page']): p for p in pages}
    out = {}
    for cid, pk in sorted(mapping.items()):
        p = by_page[pk]
        out[str(cid)] = {
            'book': p['book'], 'page': p['page'],
            'name': renamed.get(cid, p['title']),
            'servings': p['servings'],
            'ingredients': p['items'],
        }
    _guard.write_json(OUT, out)

    total = sum(len(v['ingredients']) for v in out.values())
    print(f'\nOK — {len(out)} cards mapped, {total} ingredient lines -> {OUT}')
    for cid, (_, n) in sorted(RENAME.items()):
        print(f'   renamed  {cid}: {n}')
    for cid, (_, n) in sorted(ADD.items()):
        print(f'   NEW card {cid}: {n}')


if __name__ == '__main__':
    main()
